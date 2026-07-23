"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, FolderKanban } from "lucide-react";
import { EmptyState } from "@integration-scout/ui";
import { useApiClient } from "@/lib/use-api-client";

export default function DashboardPage() {
  const getApi = useApiClient();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await getApi()).listProjects(),
  });

  const createProject = useMutation({
    mutationFn: async (projectName: string) => (await getApi()).createProject({ name: projectName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setIsCreating(false);
      setName("");
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-medium tracking-tight">Projects</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
        >
          <Plus className="h-4 w-4" /> New project
        </button>
      </div>

      {isCreating && (
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createProject.mutate(name.trim());
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name (e.g. Contentful ⇄ HubSpot sync)"
            className="w-full max-w-sm rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-stone-700 dark:bg-stone-900"
          />
          <button
            type="submit"
            disabled={createProject.isPending}
            className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}

      <div className="mt-8">
        {isLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : projects && projects.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/workspace/${project.id}/import`}
                  className="block rounded-xl border border-stone-200 p-5 transition hover:border-accent-400 hover:shadow-sm dark:border-stone-800"
                >
                  <FolderKanban className="h-5 w-5 text-stone-400" />
                  <p className="mt-3 text-sm font-medium">{project.name}</p>
                  {project.description && (
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      {project.description}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FolderKanban className="h-8 w-8" />}
            title="No projects yet"
            description="Create a project to start importing and analyzing a platform."
          />
        )}
      </div>
    </div>
  );
}
