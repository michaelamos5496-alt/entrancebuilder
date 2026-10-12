import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <EmptyState as="h1" icon="door" title="This door doesn't exist" action={<ButtonLink href="/configurator">Create a new door</ButtonLink>}>
        The page you are looking for isn&apos;t here, or the link is incorrect.
      </EmptyState>
    </div>
  );
}
