import type { Metadata } from "next";
import { ConfiguratorApp } from "@/features/configurator/ConfiguratorApp";

export const metadata: Metadata = { title: "Create a door" };

export default function ConfiguratorPage() {
  return <ConfiguratorApp />;
}
