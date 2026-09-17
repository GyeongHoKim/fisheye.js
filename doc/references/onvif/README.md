# ONVIF reference material

These files are archived verbatim so the lens-model implementation can be reviewed against a fixed specification revision.

| File | Upstream | Retrieved | SHA-256 |
| --- | --- | --- | --- |
| `ONVIF-Media2-Service-Spec-v2606.pdf` | <https://www.onvif.org/specs/srv/media/ONVIF-Media2-Service-Spec.pdf> | 2026-09-18 | `8204c783fff4db7d9a108f7244fe46fade43bad1e2c8bc987de3dcbddca4fd5e` |
| `onvif.xsd` | <https://www.onvif.org/ver10/schema/onvif.xsd> | 2026-09-18 | `1de6e9dd31a18a6773b611c4f7eaa0528f219098ddfc883b380802aa9a7ff647` |

The PDF identifies itself as Media2 Service Specification Version 26.06 (June 2026). Its copyright, copying permission, license, and disclaimer are retained in the unmodified document. The XSD retains its original ONVIF header and license text. These materials are not covered by this project's MIT license.

Relevant locations:

- Media2 Annex B, “Lens description” (normative), PDF pages 46–47.
- `VideoSourceConfigurationExtension2`, `LensProjection`, `LensOffset`, and `LensDescription` in `onvif.xsd`.

The specification defines an angle-to-radius mapping and asks for a smooth B-Spline approximation, but does not define the degree, knot vector, boundary conditions, or a reference algorithm. fisheye.js therefore uses a natural cubic interpolating spline through the implicit origin and supplied samples. This is a documented client-side implementation choice, not an ONVIF-mandated spline construction or device conformance claim.
