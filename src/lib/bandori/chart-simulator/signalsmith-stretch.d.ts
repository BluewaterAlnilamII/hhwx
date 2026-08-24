declare module "signalsmith-stretch" {
  type SignalsmithStretchSchedule = {
    active?: boolean;
    input?: number;
    output?: number;
    rate?: number;
    semitones?: number;
  };

  type SignalsmithStretchNode = AudioWorkletNode & {
    inputTime: number;
    addBuffers(
      channels: Float32Array[],
      transfer?: Transferable[],
    ): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number }>;
    latency(): Promise<number>;
    schedule(
      state: SignalsmithStretchSchedule,
      adjustPrevious?: boolean,
    ): Promise<SignalsmithStretchSchedule>;
  };

  type SignalsmithStretchFactory = {
    (
      context: AudioContext,
      options?: AudioWorkletNodeOptions,
    ): Promise<SignalsmithStretchNode>;
    moduleUrl?: string;
  };

  const createSignalsmithStretch: SignalsmithStretchFactory;
  export default createSignalsmithStretch;
}
