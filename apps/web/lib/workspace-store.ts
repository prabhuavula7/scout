import { create } from "zustand";

interface WorkspaceState {
  selectedPlatformByProject: Record<string, string>;
  selectPlatform: (projectId: string, platformId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedPlatformByProject: {},
  selectPlatform: (projectId, platformId) =>
    set((state) => ({
      selectedPlatformByProject: { ...state.selectedPlatformByProject, [projectId]: platformId },
    })),
}));
