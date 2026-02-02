# [2.0.0](https://github.com/GyeongHoKim/fisheye.js/compare/v1.1.1...v2.0.0) (2026-02-02)


* feat(types)!: refactor FisheyeProjection to object format and group config ([ee1b060](https://github.com/GyeongHoKim/fisheye.js/commit/ee1b060d196d8a2bf39fccfd6beadf853b2d1c0c))


### Bug Fixes

* **fisheye:** use if/else instead of conditional expressions in GPU shader ([f2280df](https://github.com/GyeongHoKim/fisheye.js/commit/f2280df5aa42c1e646699b8e32af5b407bef3124))
* **fisheye:** use writeBuffer in readback so output is not one frame behind ([70f2dd2](https://github.com/GyeongHoKim/fisheye.js/commit/70f2dd28e97ee6cd2eb44cfcaed5e92de97ff43d))
* initialize TypeGPU variables to resolve shader compilation errors ([7bb32f8](https://github.com/GyeongHoKim/fisheye.js/commit/7bb32f8858aabbd3478cc360a44b58a956604ba8))
* **lint:** resolve noExcessiveCognitiveComplexity in GPU compute callback ([9b6acde](https://github.com/GyeongHoKim/fisheye.js/commit/9b6acde8a0fbc06cf40028628531780aa999e030))
* resolve TypeGPU variable initialization and cylindrical projection ([8663378](https://github.com/GyeongHoKim/fisheye.js/commit/8663378e37cd32ddb4aa6e5821ae8ca3e24a8fe1))


### Features

* **example:** sample image picker, calibration from test_cases, and UI tweaks ([2f800d7](https://github.com/GyeongHoKim/fisheye.js/commit/2f800d7ea7fa856ed1f37c37e24907c8ca1bdec6))
* **fisheye:** update implementation to support new grouped config format ([4f802c6](https://github.com/GyeongHoKim/fisheye.js/commit/4f802c61649734b3f785195bda97258520533496))


### BREAKING CHANGES

* FisheyeProjection is now an object like { kind: "rectilinear" }
instead of a string. The mount parameter has been removed entirely.

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
