import "dotenv/config";
import { DiagnosticsService } from "../lib/services/diagnostics-service";

const checks = await new DiagnosticsService().runAll();
for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.message}`);
  if (check.detail) console.log(`  ${check.detail}`);
}

if (checks.some((check) => !check.ok)) {
  process.exitCode = 1;
}
