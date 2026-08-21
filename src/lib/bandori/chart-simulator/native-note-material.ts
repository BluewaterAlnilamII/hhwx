export const BANDORI_NATIVE_DIRECTIONAL_BACK_LINE_THRESHOLD = 750;
export const BANDORI_NATIVE_CURVE_SLIDE_BELT_THRESHOLD = 704.72900390625;
export const BANDORI_NATIVE_LONG_BELT_THRESHOLD = 2000;
export const BANDORI_NATIVE_LONG_NOTE_LINE_BRIGHTNESS_DEFAULT = 80;
export const BANDORI_NATIVE_LONG_NOTE_LINE_VERTEX_ALPHA =
  BANDORI_NATIVE_LONG_NOTE_LINE_BRIGHTNESS_DEFAULT / 100;

const NATIVE_ALPHA_LUMINANCE_RED = 0.212599993;
const NATIVE_ALPHA_LUMINANCE_GREEN = 0.715200007;
const NATIVE_ALPHA_LUMINANCE_BLUE = 0.0722000003;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Reproduces the alpha transfer in the JP `star/Star Transparent Colored` fragment program. */
export function evaluateBandoriNativeTransparentColoredAlpha(
  sourceAlpha: number,
  luminance: number,
  vertexAlpha = 1,
): number {
  const alpha = clampUnit(sourceAlpha) * clampUnit(vertexAlpha);
  const lightness = clampUnit(luminance);
  const polynomialAlpha = (
    alpha * (alpha * 0.305299997 + 0.682200015)
    + 0.0125000002
    - alpha
  ) * 0.349999994 + alpha;
  const gammaAlpha = clampUnit(
    Math.pow(Math.abs(alpha), 0.416700006) * 1.05499995 - 0.0549999997,
  );
  const mixedAlpha = (gammaAlpha - alpha) * 0.649999976 + alpha;
  return mixedAlpha + (polynomialAlpha - mixedAlpha) * lightness;
}

export type BandoriNativeTransparentColoredShaderSources = {
  glFragment: string;
  glVertex: string;
  wgsl: string;
};

function shaderFloat(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError("Native transparent-colored shader constant is invalid");
  }
  const serialized = String(value);
  return serialized.includes(".") ? serialized : `${serialized}.0`;
}

export function createBandoriNativeTransparentColoredShaderSources(
  vertexAlpha = 1,
): BandoriNativeTransparentColoredShaderSources {
  const nativeVertexAlpha = shaderFloat(clampUnit(vertexAlpha));
  const alphaBodyGl = `
float nativeTransparentColoredAlpha(float sourceAlpha, float luminance) {
  float polynomialAlpha = (
    sourceAlpha * (sourceAlpha * 0.305299997 + 0.682200015)
    + 0.0125000002
    - sourceAlpha
  ) * 0.349999994 + sourceAlpha;
  float gammaAlpha = clamp(
    pow(abs(sourceAlpha), 0.416700006) * 1.05499995 - 0.0549999997,
    0.0,
    1.0
  );
  float mixedAlpha = (gammaAlpha - sourceAlpha) * 0.649999976 + sourceAlpha;
  return mixedAlpha + (polynomialAlpha - mixedAlpha) * luminance;
}`;
  const glVertex = `
in vec2 aPosition;
in vec2 aUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

out vec2 vUV;
void main(void) {
  mat3 modelViewProjectionMatrix = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4(
    (modelViewProjectionMatrix * vec3(aPosition, 1.0)).xy,
    0.0,
    1.0
  );
  vUV = aUV;
}`;
  const glFragment = `
in vec2 vUV;

uniform sampler2D uTexture;

out vec4 finalColor;

${alphaBodyGl}

void main(void) {
  vec4 sourceColor = texture(uTexture, vUV);
  float coloredAlpha = sourceColor.a * ${nativeVertexAlpha};
  float luminance = dot(
    sourceColor.rgb,
    vec3(${NATIVE_ALPHA_LUMINANCE_RED}, ${NATIVE_ALPHA_LUMINANCE_GREEN}, ${NATIVE_ALPHA_LUMINANCE_BLUE})
  );
  float outputAlpha = nativeTransparentColoredAlpha(coloredAlpha, luminance);
  finalColor = vec4(sourceColor.rgb, outputAlpha);
}`;
  const wgsl = `
struct GlobalUniforms {
  uProjectionMatrix: mat3x3<f32>,
  uWorldTransformMatrix: mat3x3<f32>,
  uWorldColorAlpha: vec4<f32>,
  uResolution: vec2<f32>,
}

struct LocalUniforms {
  uTransformMatrix: mat3x3<f32>,
  uColor: vec4<f32>,
  uRound: f32,
}

@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var uTexture: texture_2d<f32>;
@group(2) @binding(1) var uSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn mainVertex(
  @location(0) aPosition: vec2<f32>,
  @location(1) aUV: vec2<f32>,
) -> VertexOutput {
  let modelViewProjectionMatrix = globalUniforms.uProjectionMatrix
    * globalUniforms.uWorldTransformMatrix
    * localUniforms.uTransformMatrix;
  return VertexOutput(
    vec4<f32>((modelViewProjectionMatrix * vec3<f32>(aPosition, 1.0)).xy, 0.0, 1.0),
    aUV,
  );
}

fn nativeTransparentColoredAlpha(sourceAlpha: f32, luminance: f32) -> f32 {
  let polynomialAlpha = (
    sourceAlpha * (sourceAlpha * 0.305299997 + 0.682200015)
    + 0.0125000002
    - sourceAlpha
  ) * 0.349999994 + sourceAlpha;
  let gammaAlpha = clamp(
    pow(abs(sourceAlpha), 0.416700006) * 1.05499995 - 0.0549999997,
    0.0,
    1.0,
  );
  let mixedAlpha = (gammaAlpha - sourceAlpha) * 0.649999976 + sourceAlpha;
  return mixedAlpha + (polynomialAlpha - mixedAlpha) * luminance;
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
  let sourceColor = textureSample(uTexture, uSampler, uv);
  let coloredAlpha = sourceColor.a * ${nativeVertexAlpha};
  let luminance = dot(
    sourceColor.rgb,
    vec3<f32>(${NATIVE_ALPHA_LUMINANCE_RED}, ${NATIVE_ALPHA_LUMINANCE_GREEN}, ${NATIVE_ALPHA_LUMINANCE_BLUE}),
  );
  let outputAlpha = nativeTransparentColoredAlpha(coloredAlpha, luminance);
  return vec4<f32>(sourceColor.rgb, outputAlpha);
}`;
  return { glFragment, glVertex, wgsl };
}
