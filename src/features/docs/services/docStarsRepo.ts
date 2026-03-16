import type { DocStarStatus, StarredDocRecord } from "@/features/docs/domain/types";
import { getDocState, listStarredDocStates, setDocStarState } from "@/features/docs/services/docStatesRepo";

function mapDocStarStatus(state: Awaited<ReturnType<typeof getDocState>>): DocStarStatus {
  return {
    path: state.path,
    name: state.name,
    isStarred: state.isStarred,
    starredAt: state.starredAt
  };
}

function mapStarredDoc(state: Awaited<ReturnType<typeof getDocState>>): StarredDocRecord {
  return {
    path: state.path,
    name: state.name,
    starredAt: state.starredAt ?? new Date(0).toISOString()
  };
}

export async function listStarredDocs(filter?: { pathPrefix?: string }): Promise<StarredDocRecord[]> {
  const states = await listStarredDocStates(filter);
  return states.map(mapStarredDoc);
}

export async function getDocStarStatus(inputPath: string): Promise<DocStarStatus> {
  const state = await getDocState(inputPath);
  return mapDocStarStatus(state);
}

export async function setDocStarStatus(inputPath: string, isStarred: boolean): Promise<DocStarStatus> {
  const state = await setDocStarState(inputPath, isStarred);
  return mapDocStarStatus(state);
}
