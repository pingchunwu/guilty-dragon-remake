import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, Vector4, type Texture } from "three";

/* Light-only materials: additive, no depth write, so they stack like light and bloom cleanly. */

const light = (m: ConstructorParameters<typeof ShaderMaterial>[0]) =>
  new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, ...m });

const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;

const NOISE = `
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1.,0.)), f.x), mix(h(i+vec2(0.,1.)), h(i+vec2(1.,1.)), f.x), f.y); }`;

/* ---------- ring: alpha texture, angular write-in reveal, travelling glint ---------- */

const RING_FRAG = `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uReveal; uniform float uAlpha;
uniform float uGlint; uniform float uSweep;
varying vec2 vUv;
void main(){
  vec2 p = vUv - .5;
  float a = atan(p.y, p.x) / 6.2831853 + .5;
  float front = uReveal * 1.15;
  float m = 1. - smoothstep(front - .12, front, a);
  float head = smoothstep(front - .25, front - .03, a) * m * (1. - step(1., uReveal));
  float t = texture2D(uMap, vUv).a;
  float glint = exp(-fract(uSweep - a) * 12.) * uGlint;
  vec3 col = mix(uColor, vec3(1.), smoothstep(.7, 1., t) * .85);
  gl_FragColor = vec4(col * (1. + 1.6 * head + 1.8 * glint), t * m * uAlpha);
}`;

export function ringMaterial(map: Texture, color: string, glint: number, alpha = 0.8) {
  return light({
    uniforms: {
      uMap: { value: map },
      uColor: { value: new Color(color) },
      uReveal: { value: 0 },
      uAlpha: { value: alpha },
      uGlint: { value: glint },
      uSweep: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: RING_FRAG,
  });
}

/* ---------- pillar of light ---------- */

const PILLAR_VERT = `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const PILLAR_FRAG = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
${NOISE}
void main(){
  float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
  float g = smoothstep(0., .08, vUv.y) * (1. - smoothstep(.7, 1., vUv.y));
  float a = vUv.x * 6.2831853;
  float n = vn(vec2(cos(a) * 2.5 + vUv.y * 3. - uTime * .15, sin(a) * 2.5));
  vec3 col = mix(uColor, vec3(1.), f * f * .5);
  gl_FragColor = vec4(col, f * g * (.65 + .5 * n) * uAlpha);
}`;

export function pillarMaterial(color: string) {
  return light({
    uniforms: { uColor: { value: new Color(color) }, uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: PILLAR_VERT,
    fragmentShader: PILLAR_FRAG,
    side: DoubleSide,
  });
}

/* ---------- ribbon along a tube's length: head at uProg, tail at uTail ---------- */

const RIBBON_FRAG = `
uniform vec3 uColor; uniform float uProg; uniform float uTail;
varying vec2 vUv;
void main(){
  float x = vUv.x;
  float a = (1. - smoothstep(uProg - .02, uProg, x)) * smoothstep(0., .06, x) * (1. - smoothstep(.94, 1., x))
    * smoothstep(uTail - .02, uTail, x);
  float head = exp(-max(uProg - x, 0.) * 5.) * (1. - step(1., uProg));
  gl_FragColor = vec4(mix(uColor, vec3(1.), .5) * (.7 + 1.4 * head), a);
}`;

export function ribbonMaterial(color: string) {
  return light({
    uniforms: { uColor: { value: new Color(color) }, uProg: { value: 0 }, uTail: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: RIBBON_FRAG,
  });
}

/* ---------- beam: flowing energy between two points, white-hot core in the leader's colour ---------- */

const BEAM_FRAG = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uLen; uniform float uDir; uniform float uPx;
varying vec2 vUv;
${NOISE}
void main(){
  float x = vUv.x;
  float p = (vUv.y - .5) * 2.;
  float d = p * uPx * .5;                              // distance from the axis in px
  float sig = uPx * .14;                               // sheath sigma
  float win = 1. - smoothstep(.55, 1., abs(p));
  float core = exp(-d * d / 3.2);                      // crisp 2-4px white-hot line
  float sheath = exp(-d * d / (sig * sig));
  float soft = exp(-d * d / (sig * sig * 2.2)) * .18;
  float flow = vn(vec2(x * uLen / 22. - uTime * 3. * uDir, p * 1.5));
  float bands = .55 + .45 * sin(x * uLen / 14. - uTime * 9. * uDir + flow * 3.);
  float ends = smoothstep(0., 24. / uLen, x) * (1. - smoothstep(1. - 10. / uLen, 1., x));
  float head = exp(-(1. - x) * uLen / 40.);
  vec3 col = mix(uColor * 1.25, vec3(1.), clamp(core + head * .25, 0., 1.));
  float a = (sheath * .55 * (.6 + .4 * bands) + soft + core * .8) * win * ends * uAlpha;
  gl_FragColor = vec4(col * (.75 + .5 * head), a);
}`;

export function beamMaterial(color: string) {
  return light({
    uniforms: {
      uColor: { value: new Color(color) },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
      uLen: { value: 1 },
      uDir: { value: 1 },
      uPx: { value: 100 },
    },
    vertexShader: VERT,
    fragmentShader: BEAM_FRAG,
  });
}

/* ---------- shockwave ring (on a quad; uR is the radius as a fraction of the half-size) ---------- */

const SHOCK_FRAG = `
uniform vec3 uColor; uniform float uR; uniform float uW; uniform float uAlpha;
varying vec2 vUv;
void main(){
  float r = length(vUv - .5) * 2.;
  float d = (r - uR) / uW;
  float ring = exp(-d * d);
  float trail = exp(-max(uR - r, 0.) * 7.) * step(r, uR) * .08;
  float a = (ring + trail) * uAlpha * (1. - smoothstep(.85, 1., r));
  gl_FragColor = vec4(mix(uColor, vec3(1.), ring * .75), a);
}`;

export function shockMaterial(color: string) {
  return light({
    uniforms: { uColor: { value: new Color(color) }, uR: { value: 0 }, uW: { value: 0.045 }, uAlpha: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: SHOCK_FRAG,
  });
}

/* ---------- flare: soft core with an anamorphic streak ---------- */

const FLARE_FRAG = `
uniform vec3 uColor; uniform float uAlpha;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - .5) * 2.;
  float core = exp(-dot(p, p) * 14.);
  float streak = exp(-abs(p.x) * 2.6) * exp(-p.y * p.y * 220.) * (1. - smoothstep(.55, 1., abs(p.x)));
  float a = (core + streak * .8) * uAlpha;
  gl_FragColor = vec4(mix(uColor, vec3(1.), clamp(core, 0., 1.)), a);
}`;

export function flareMaterial(color: string) {
  return light({
    uniforms: { uColor: { value: new Color(color) }, uAlpha: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: FLARE_FRAG,
  });
}

/* ---------- blade arc: a tapered crescent strip swept by uProg, trailing off at uTail ---------- */

const BLADE_FRAG = `
uniform vec3 uColor; uniform float uProg; uniform float uTail; uniform float uAlpha;
varying vec2 vUv;
void main(){
  float t = vUv.x;
  float p = (vUv.y - .5) * 2.;
  float m = (1. - smoothstep(uProg - .015, uProg, t)) * smoothstep(uTail - .25, uTail + .02, t);
  float core = exp(-p * p * 6.);
  float edge = exp(-pow(abs(p) - .8, 2.) * 40.) * .5;
  float head = exp(-max(uProg - t, 0.) * 9.) * (1. - step(1., uProg));
  vec3 col = mix(uColor, vec3(1.), clamp(core * .9 + head * .5, 0., 1.));
  gl_FragColor = vec4(col * (1. + head), (core * .8 + edge + .15) * m * uAlpha);
}`;

export function bladeMaterial(color: string) {
  return light({
    uniforms: { uColor: { value: new Color(color) }, uProg: { value: 0 }, uTail: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: BLADE_FRAG,
    side: DoubleSide,
  });
}

/* ---------- hex barrier: a hexagonal panel of glowing cells; cracks grow with uCrack, uBreak dissolves cells ---------- */

export const CRACK_SEGMENTS = 24;

const HEX_FRAG = `
uniform vec3 uColor; uniform float uAppear; uniform float uCrack; uniform float uBreak; uniform float uAlpha; uniform float uTime;
uniform vec4 uSeg[${CRACK_SEGMENTS}];
varying vec2 vUv;
const vec2 S = vec2(1.7320508, 1.);
float hexd(vec2 p){ p = abs(p); return max(dot(p, S * .5), p.y); }
vec4 hexGrid(vec2 uv){
  vec4 hC = floor(vec4(uv, uv - vec2(1., .5)) / S.xyxy) + .5;
  vec4 hh = vec4(uv - hC.xy * S, uv - (hC.zw + .5) * S);
  return dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw) ? vec4(hh.xy, hC.xy) : vec4(hh.zw, hC.zw + .5);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float k = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * k); }
void main(){
  vec2 p = (vUv - .5) * 2.;
  float rad = length(p);
  float body = .97 - hexd(p.yx * 1.0);              // >0 inside the panel (pointy-top hexagon)
  float inside = smoothstep(0., .02, body);
  vec4 g = hexGrid(p * 5.5);
  float e = .5 - hexd(g.xy);                        // 0 on a cell edge
  float cellId = hash(g.zw);
  float lines = smoothstep(.07, .0, e);
  float pulse = .55 + .45 * sin(uTime * 2. + cellId * 6.2831853);
  float appear = smoothstep(uAppear * 1.5 + .02, uAppear * 1.5 - .25, rad);
  float front = exp(-pow((rad - uAppear * 1.5) / .1, 2.)) * step(uAppear, .999);
  float alive = smoothstep(cellId * .7, cellId * .7 + .3, 1. - uBreak);
  float cells = (lines * (.5 + .5 * pulse) + (1. - smoothstep(0., .22, e)) * cellId * .07 * pulse) * alive;
  float rim = exp(-pow(body / .035, 2.)) * appear;
  // cracks: branch b grows through its segments (order i%4) as uCrack rises
  float crack = 0.;
  for (int i = 0; i < ${CRACK_SEGMENTS}; i++) {
    float k = float(i - (i / 4) * 4) * .25 + float(i / 4) * .02;
    float vis = smoothstep(k, k + .05, uCrack);
    crack += vis * exp(-pow(seg(p, uSeg[i].xy, uSeg[i].zw) / .014, 2.));
  }
  crack = min(crack, 1.) * (1. - uBreak);
  float a = ((cells * .75 + rim * .9) * appear + front * .6 + crack) * inside * uAlpha;
  vec3 col = mix(uColor, vec3(1.), clamp(crack + front * .6 + rim * .35, 0., 1.));
  gl_FragColor = vec4(col, a);
}`;

export function hexMaterial(color: string, segments: Float32Array) {
  const seg = Array.from({ length: CRACK_SEGMENTS }, (_, i) => new Vector4(...(segments.slice(i * 4, i * 4 + 4) as unknown as [number, number, number, number])));
  return light({
    uniforms: {
      uColor: { value: new Color(color) },
      uAppear: { value: 0 },
      uCrack: { value: 0 },
      uBreak: { value: 0 },
      uAlpha: { value: 1 },
      uTime: { value: 0 },
      uSeg: { value: seg },
    },
    vertexShader: VERT,
    fragmentShader: HEX_FRAG,
    side: DoubleSide,
  });
}
