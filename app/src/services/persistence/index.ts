import { isCloudConfigured } from "@/lib/env";
import { createCloudRepository } from "./cloudRepository";
import { localProjectRepository } from "./localRepository";
import { supabaseCloudApi } from "./supabaseCloudApi";
import type { ProjectRepository } from "./types";

export * from "./types";

let cloud: ProjectRepository | null = null;

/**
 * Cloud storage when Supabase is configured; otherwise the clearly-labelled local development store.
 * `repository.mode` tells the UI which one it is so it never claims "saved to your account" in local mode.
 */
export function getRepository(): ProjectRepository {
  if (!isCloudConfigured()) return localProjectRepository;
  cloud ??= createCloudRepository(supabaseCloudApi());
  return cloud;
}
