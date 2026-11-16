export function withVertexFlex(material, patchMaterial, key, uniforms, declarations, code) {
  patchMaterial(material);
  const patched = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    patched(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${declarations}\n${shader.vertexShader}`.replace("#include <begin_vertex>", `#include <begin_vertex>\n${code}`);
  };
  material.customProgramCacheKey = () => `gelatin-prop-${key}`;
  return material;
}
