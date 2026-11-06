/**
 * Шейдери поля частинок (ADR 0007): GLSL ES 3.0 для RawShaderMaterial three.js (рядок `#version` додає three).
 * Кожна точка має п'ять позицій (`position`, p1…p4) і п'ять тонів (t0…t4: індекс палітри й вага). Стадія `uP` — від 0
 * до 4: між сусідніми формами точки рушають із розкидом у часі (aR.x) і легким розльотом посередині. Курсор
 * розштовхує точки, наведена картка ролі збільшує й підсвічує свою сферу, решта тьмяніє.
 */

export const VERTEX = /* glsl */ `
precision highp float;
in vec3 position; in vec3 p1; in vec3 p2; in vec3 p3; in vec3 p4;
in vec2 t0; in vec2 t1; in vec2 t2; in vec2 t3; in vec2 t4;
in vec4 aR; in float aK;
uniform float uT; uniform float uP; uniform float uAspect; uniform float uMotion; uniform float uDpr;
uniform float uYaw; uniform float uPitch; uniform float uFocus; uniform float uDepth;
uniform vec2 uMouse;
uniform vec3 uPal[6];
out vec3 vC; out float vA;
float ease(float x){ x = clamp(x, 0., 1.); return x * x * (3. - 2. * x); }
float is(float s, float k){ return 1. - step(0.5, abs(s - k)); }
vec3 F(float s){ return position * is(s, 0.) + p1 * is(s, 1.) + p2 * is(s, 2.) + p3 * is(s, 3.) + p4 * is(s, 4.); }
vec2 T(float s){ return t0 * is(s, 0.) + t1 * is(s, 1.) + t2 * is(s, 2.) + t3 * is(s, 3.) + t4 * is(s, 4.); }
vec3 rY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
void main(){
  float s = min(floor(uP), 3.);
  float f = uP - s;
  float k = ease((f - aR.x * 0.35) / 0.65);
  vec3 pos = mix(F(s), F(s + 1.), k);
  vec2 ta = T(s); vec2 tb = T(s + 1.);
  vec3 col = mix(uPal[int(ta.x + 0.5)], uPal[int(tb.x + 0.5)], k);
  float weight = mix(ta.y, tb.y, k);
  pos += (aR.yzw - 0.5) * 0.55 * sin(k * 3.14159);
  // Біля форми ролей (стадія 3) працює підсвітка сфери; у формі 4 поле «дихає» хвилею.
  float nearRoles = is(s, 3.) * (1. - k) + is(s, 2.) * k;
  float wave = is(s, 3.) * k;
  pos.y += uMotion * wave * (0.08 * sin(pos.x * 2.4 + uT * 1.1) + 0.06 * sin(pos.z * 3.1 + uT * 0.8));
  pos += uMotion * 0.012 * vec3(sin(uT * 0.7 + aR.y * 40.), cos(uT * 0.6 + aR.z * 40.), sin(uT * 0.5 + aR.w * 40.));
  float focus = 0.;
  if (uFocus > -0.5 && aK > -0.5) focus = abs(aK - uFocus) < 0.5 ? 1. : -1.;
  pos = rX(rY(pos, uYaw), uPitch);
  pos.z -= uDepth;
  vec2 ndc = vec2(pos.x * 2.3 / uAspect, pos.y * 2.3) / (-pos.z);
  vec2 dv = ndc - uMouse; dv.x *= uAspect;
  float dist = length(dv);
  ndc += uMotion * (dv / (dist + 1e-4)) * 0.1 * exp(-dist * dist / 0.016) * vec2(1. / uAspect, 1.);
  gl_Position = vec4(ndc, 0., 1.);
  float grow = 1. + nearRoles * max(focus, 0.) * 0.6;
  gl_PointSize = uDpr * (1.1 + aR.y * 1.7) * (uDepth / (-pos.z)) * grow;
  vA = weight * (0.55 + 0.45 * aR.z) * (1. - uMotion * 0.25 * (0.5 + 0.5 * sin(uT * 2. + aR.w * 50.)));
  vA *= 1. + nearRoles * (focus > 0. ? 0.9 : (focus < 0. ? -0.6 : 0.));
  vC = col;
}
`;

export const FRAGMENT = /* glsl */ `
precision mediump float;
in vec3 vC; in float vA;
out vec4 o;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.05, r) * vA;
  o = vec4(vC * a, a);
}
`;
