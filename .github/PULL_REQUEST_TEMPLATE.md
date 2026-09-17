## Summary

Brief description of changes.

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Checklist

> **WebGPU tests:** CI executes the production TypeGPU pipeline through Dawn and pinned Mesa Lavapipe. Browser testing remains a small `VideoFrame` integration smoke test.

- [ ] `npm run lint` passes
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
- [ ] `npm run test:unit` passes
- [ ] `npm run test:gpu:container` passes
- [ ] `npm run test:browser` passes locally when browser integration changed
