import { playSoundEffect } from "@/lib/sound-effect-audio";

export async function playCommentStampVoice(voiceUrl: string): Promise<void> {
  await playSoundEffect(voiceUrl);
}
