import { spawnSync } from "node:child_process";

const repetitions = Number.parseInt(process.env.GPU_TEST_REPETITIONS ?? "10", 10);
if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
  throw new Error("GPU_TEST_REPETITIONS must be a positive integer");
}

for (let run = 1; run <= repetitions; run += 1) {
  console.log(`\nWebGPU stability run ${run}/${repetitions}`);
  const result = spawnSync("npm", ["run", "test:gpu"], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
