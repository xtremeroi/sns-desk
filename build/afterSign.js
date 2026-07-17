// electron-builder afterSign hook: fold the WidgetKit extension into the signed
// Desk bundle, re-seal inside-out, then notarize + staple the whole thing.
//
// Runs only when EMBED_WIDGET=1 (the `dist:widget` script) so normal `dist`
// builds are unaffected. The extension is pre-built + Developer ID signed at
// build/widget-ext/SNSDeskWidgetsExtension.appex (see scripts/build-widget.sh).
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const IDENTITY = "Developer ID Application: Randy Miguel (29528WCWRA)";
const NOTARY_PROFILE = "sns-desk";

exports.default = async function afterSign(context) {
  if (process.env.EMBED_WIDGET !== "1") return;
  if (context.electronPlatformName !== "darwin") return;

  const projectDir = context.packager.info.projectDir;
  const appName = context.packager.appInfo.productFilename; // "S&S Desk"
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const appexSrc = path.join(projectDir, "build", "widget-ext", "SNSDeskWidgetsExtension.appex");
  const pluginsDir = path.join(appPath, "Contents", "PlugIns");
  const appexDst = path.join(pluginsDir, "SNSDeskWidgetsExtension.appex");
  const entitlements = path.join(projectDir, "build", "entitlements.mac.plist");

  const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

  console.log("[afterSign] embedding widget extension →", appexDst);
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.rmSync(appexDst, { recursive: true, force: true });
  run("cp", ["-R", appexSrc, appexDst]); // keeps the appex's own Developer ID signature

  // Re-seal the outer app so PlugIns is part of its signature. NOT --deep, so
  // the appex's inside-out signature is preserved.
  console.log("[afterSign] re-sealing outer app");
  run("codesign", ["--force", "--options", "runtime", "--timestamp",
    "--entitlements", entitlements, "--sign", IDENTITY, appPath]);
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

  // Notarize the whole bundle, then staple.
  console.log("[afterSign] notarizing (this waits on Apple's queue)…");
  const zip = path.join(context.appOutDir, "notarize-upload.zip");
  fs.rmSync(zip, { force: true });
  run("ditto", ["-c", "-k", "--keepParent", appPath, zip]);
  run("xcrun", ["notarytool", "submit", zip, "--keychain-profile", NOTARY_PROFILE, "--wait"]);
  run("xcrun", ["stapler", "staple", appPath]);
  fs.rmSync(zip, { force: true });
  console.log("[afterSign] widget embedded + notarized + stapled ✓");
};
