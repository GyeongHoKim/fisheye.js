# Fixed linux/amd64 Node 24.13.0 / Debian trixie image. Trixie's libstdc++
# provides the GLIBCXX ABI required by webgpu's prebuilt Dawn module.
FROM node:24.13.0-trixie-slim@sha256:71b380b4b918650f5be84db689c041459154345bddc7df0dc35c375a2eb0060b

# Freeze transitive system packages, including Mesa/Lavapipe and LLVM.
RUN rm /etc/apt/sources.list.d/debian.sources \
    && printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20260210T000000Z trixie main\ndeb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20260210T000000Z trixie-security main\n' > /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends mesa-vulkan-drivers libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

ENV VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json
ENV FISHEYE_SOFTWARE_GPU=1
ENV HUSKY=0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
CMD ["npm", "test"]
