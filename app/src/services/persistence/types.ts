import type { Selections, ViewSide } from "@/domain/design/types";
import type { Placement } from "@/domain/imaging/types";

export type ProjectErrorCode =
  | "AUTH_REQUIRED" // cloud: not signed in / session expired
  | "NAME_TAKEN"
  | "NOT_FOUND"
  | "NETWORK" // could not reach the server
  | "QUOTA" // browser storage full
  | "INVALID" // the data was rejected (name, photo, placement)
  | "UNAVAILABLE" // storage not available in this browser / not configured on the server
  | "SERVER";

/** An error whose message is fit to show the user as-is. Never contains internals. */
export class ProjectError extends Error {
  constructor(public readonly code: ProjectErrorCode, message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

/** A photo to persist with a project. Uploaded photos are stored as private files; gallery photos are just a reference. */
export type PhotoSave =
  | { kind: "gallery"; galleryId: string; width: number; height: number; placement: Placement }
  | {
      kind: "upload";
      /** the new file; `null` = keep the file already stored and only update the placement */
      blob: Blob | null;
      width: number;
      height: number;
      placement: Placement;
    };

export interface SaveInput {
  /** present when updating an existing project */
  id?: string | null;
  name: string;
  config: Selections;
  /** views missing here are REMOVED from the stored project */
  photos: Partial<Record<ViewSide, PhotoSave>>;
  /** thumbnail of what the user sees (PNG) */
  preview: Blob | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: Selections;
  previewUrl: string | null;
  photoViews: ViewSide[];
}

export type LoadedPhoto =
  | { kind: "gallery"; galleryId: string; width: number; height: number; placement: Placement }
  | { kind: "upload"; width: number; height: number; placement: Placement; blob: Blob };

export interface LoadedProject {
  id: string;
  name: string;
  config: Selections;
  photos: Partial<Record<ViewSide, LoadedPhoto>>;
  /** problems restoring (e.g. a photo that could not be fetched). The project still opens. */
  warnings: string[];
}

export interface SaveResult {
  project: ProjectSummary;
  /** the project row is saved, but something optional failed (e.g. the preview image) */
  warnings: string[];
}

export interface ProjectRepository {
  /** "cloud": Supabase account storage. "local-dev": this browser only, for development without credentials. */
  readonly mode: "cloud" | "local-dev";
  /** short, honest description of where data lives, shown in the UI */
  readonly where: string;
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<LoadedProject>;
  save(input: SaveInput): Promise<SaveResult>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const NAME_MAX = 60;
export const normaliseName = (n: string) => n.trim();
export const sameName = (a: string, b: string) => normaliseName(a).toLowerCase() === normaliseName(b).toLowerCase();

export function checkName(name: string): string {
  const n = normaliseName(name);
  if (!n) throw new ProjectError("INVALID", "Give your project a name.");
  if (n.length > NAME_MAX) throw new ProjectError("INVALID", `Keep the name under ${NAME_MAX + 1} characters.`);
  return n;
}
