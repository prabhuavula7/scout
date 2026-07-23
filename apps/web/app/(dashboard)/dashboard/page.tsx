"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, FolderKanban, Pencil, Trash2, X, Check } from "lucide-react";
import { EmptyState } from "@integration-scout/ui";
import { useApiClient } from "@/lib/use-api-client";
import type { Project } from "@integration-scout/types";

function EditProjectForm({
  project,
  onCancel,
  onSaved,
}: {
  project: Project;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const getApi = useApiClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");

  const updateProject = useMutation({
    mutationFn: async () =>
      (await getApi()).updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onSaved();
    },
  });

  return (
    <form
      className="rounded-xl border border-accent-400 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) updateProject.mutate();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-stone-300 px-2 py-1 text-sm font-medium outline-none focus:border-accent-500 dark:border-stone-700 dark:bg-stone-900"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description (optional)"
        className="mt-2 w-full rounded-lg border border-stone-300 px-2 py-1 text-xs outline-none focus:border-accent-500 dark:border-stone-700 dark:bg-stone-900"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={updateProject.isPending || !name.trim()}
          className="flex items-center gap-1 rounded-lg bg-accent-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-600 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm({
  project,
  onCancel,
  onDeleted,
}: {
  project: Project;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const getApi = useApiClient();
  const queryClient = useQueryClient();

  const deleteProject = useMutation({
    mutationFn: async () => (await getApi()).deleteProject(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onDeleted();
    },
  });

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
      <p className="text-sm font-medium text-red-900 dark:text-red-200">Delete "{project.name}"?</p>
      <p className="mt-1 text-xs text-red-700 dark:text-red-300">
        This permanently removes the project and every platform imported into it. This can't be undone.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => deleteProject.mutate()}
          disabled={deleteProject.isPending}
          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {deleteProject.isPending ? "Deleting…" : "Delete"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const getApi = useApiClient();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await getApi()).listProjects(),
  });

  const createProject = useMutation({
    mutationFn: async () =>
      (await getApi()).createProject({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setIsCreating(false);
      setName("");
      setDescription("");
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
          className="mt-6 max-w-sm space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createProject.mutate();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name (e.g. Contentful and HubSpot sync)"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-stone-700 dark:bg-stone-900"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-accent-500 dark:border-stone-700 dark:bg-stone-900"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={createProject.isPending || !name.trim()}
              className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setName("");
                setDescription("");
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-8">
        {isLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : projects && projects.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                {deletingId === project.id ? (
                  <DeleteConfirm
                    project={project}
                    onCancel={() => setDeletingId(null)}
                    onDeleted={() => setDeletingId(null)}
                  />
                ) : editingId === project.id ? (
                  <EditProjectForm
                    project={project}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => setEditingId(null)}
                  />
                ) : (
                  <div className="group relative rounded-xl border border-stone-200 p-5 transition hover:border-accent-400 hover:shadow-sm dark:border-stone-800">
                    <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => setEditingId(project.id)}
                        aria-label="Edit project"
                        className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingId(project.id)}
                        aria-label="Delete project"
                        className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Link href={`/workspace/${project.id}/import`} className="block pr-12">
                      <FolderKanban className="h-5 w-5 text-stone-400" />
                      <p className="mt-3 text-sm font-medium">{project.name}</p>
                      {project.description && (
                        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                          {project.description}
                        </p>
                      )}
                    </Link>
                  </div>
                )}
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
