import { readOurNotesMasterInputs } from "./master-server";
import { mergeOurNotesCatalog, type OurNotesCatalogName } from "./catalogs-contract";

type CatalogCache = { inputs: unknown[]; value: ReturnType<typeof mergeOurNotesCatalog> };
const catalogs: Partial<Record<OurNotesCatalogName, CatalogCache>> = {};
export async function readOurNotesCatalog(dataset: OurNotesCatalogName) {
  const inputs = await readOurNotesMasterInputs(dataset);
  const cached = catalogs[dataset];
  if (cached && inputs.every((value, index) => value === cached.inputs[index])) return cached.value;
  const value = mergeOurNotesCatalog(inputs, dataset);
  catalogs[dataset] = { inputs, value };
  return value;
}
