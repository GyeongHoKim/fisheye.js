## [1.1.1](https://github.com/GyeongHoKim/fisheye.js/compare/v1.1.0...v1.1.1) (2026-01-30)


### Bug Fixes

* bilinear interpolation ([570ccee](https://github.com/GyeongHoKim/fisheye.js/commit/570ccee7d3836235002dc5ca32e1f00389db7b97))

# [1.1.0](https://github.com/GyeongHoKim/fisheye.js/compare/v1.0.2...v1.1.0) (2026-01-29)


### Bug Fixes

* **buffer:** destroying readback buffer issue ([496b84e](https://github.com/GyeongHoKim/fisheye.js/commit/496b84e9acf0eb7f05d101f4e745dbf033976e62))


### Features

* **projection:** add projection logic ([cfc6843](https://github.com/GyeongHoKim/fisheye.js/commit/cfc6843fefedef589838fd2865cdd9d5c27ee50a))
* **projection:** modify FisheyeOptions type ([1218b28](https://github.com/GyeongHoKim/fisheye.js/commit/1218b28f6951e828aaa4aab7dce305b8aaf3eed7))

## [1.0.2](https://github.com/GyeongHoKim/fisheye.js/compare/v1.0.1...v1.0.2) (2026-01-29)


### Bug Fixes

* **example:** align fisheye k1–k4 slider ranges with OpenCV model ([4cb8457](https://github.com/GyeongHoKim/fisheye.js/commit/4cb845774d0d152ffdd212e781556dd0c30f3f7a))

## [1.0.1](https://github.com/GyeongHoKim/fisheye.js/compare/v1.0.0...v1.0.1) (2026-01-28)


### Bug Fixes

* **fov:** applied fov ([593a07a](https://github.com/GyeongHoKim/fisheye.js/commit/593a07a08a9ec0cbb698dab98c1108e82d34e47a))
* **typegpu:** fix shader layout and reference usage in dewarp compute ([ba93ecb](https://github.com/GyeongHoKim/fisheye.js/commit/ba93ecb2fc217bdca4bbae903a4979d8f88b794f))

# 1.0.0 (2026-01-28)


### Bug Fixes

* default html5 canvas size ([361d56a](https://github.com/GyeongHoKim/fisheye.js/commit/361d56a83e0cdc73f10dde4acf58089d1a6314da))


### Features

* add convert util RGBA to YUV ([8cb6153](https://github.com/GyeongHoKim/fisheye.js/commit/8cb6153697f634e5dce789fa62d489e6d806e6aa))
* dewarp video frame ([f95e4a0](https://github.com/GyeongHoKim/fisheye.js/commit/f95e4a08899bdcf12548e1ff12d365f7017ae809))
* interface of FisheyeConfig & FisheyeOptions ([d808113](https://github.com/GyeongHoKim/fisheye.js/commit/d8081133433f1899434a9ef5790583e1d1e7c3fe))
* utils for convert yuv to video frame ([c72b53a](https://github.com/GyeongHoKim/fisheye.js/commit/c72b53a29591a7fdd7dbc07141d1e1a6599d858e))


### Performance Improvements

* cache compute pipeline and double-buffer readback ([2d27535](https://github.com/GyeongHoKim/fisheye.js/commit/2d27535a23e3931cfcd79d21db5a9ed5c0fb12c7))
* cache readback and pixel buffer ([be4666c](https://github.com/GyeongHoKim/fisheye.js/commit/be4666c1434a7998db84e7acebd6fd047ade1208))
* optimize logic ([4c8f5c6](https://github.com/GyeongHoKim/fisheye.js/commit/4c8f5c6936a673f0f9d61d2f505d8138c18a0d37))
