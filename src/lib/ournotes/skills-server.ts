import { readOurNotesMasterInputs } from "./master-server";
import { mergeOurNotesSkills, type OurNotesSkills } from "./skills-contract";

let cached: { inputs: unknown[]; value: OurNotesSkills } | undefined;
export async function readOurNotesSkills(): Promise<OurNotesSkills> {
  const inputs = await readOurNotesMasterInputs("skills");
  const previous = cached;
  if (previous && inputs.every((value, index) => value === previous.inputs[index])) return previous.value;
  const value = mergeOurNotesSkills(inputs);
  cached = { inputs, value };
  return value;
}
