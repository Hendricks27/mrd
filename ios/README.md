# Native iOS app for Meta Ray-Ban Display

This is Meta's official **DisplayAccess** sample (from
[facebook/meta-wearables-dat-ios](https://github.com/facebook/meta-wearables-dat-ios)
v0.8.0), pre-configured for this machine: Meta's internal signing was removed,
bundle ID changed to `com.wenjin.mrd.displaysample`, and — because Developer
Mode is enabled in your Meta AI app — **no Meta Developer Center credentials
are needed** (the `MetaAppID`/`ClientToken` placeholders in Info.plist may
stay empty during the preview).

The app registers with your glasses through the Meta AI app, then pushes a
"Car maintenance guide" tutorial UI (lists, images, buttons, video) to the
glasses display using the native `MWDATDisplay` FlexBox/Text/Button/Image API.
You navigate it with the Neural Band; button taps arrive back in the phone app.

## One-time setup

1. **Install Xcode** from the Mac App Store (big download). Then point the
   command line at it and accept the license:

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   xcodebuild -runFirstLaunch
   ```

2. **iPhone requirements**: iOS 17+, the Meta AI app (v272+) paired with your
   glasses, Developer Mode ON in the Meta AI app (done), and Developer Mode ON
   on the iPhone itself (Settings → Privacy & Security → Developer Mode —
   iOS prompts you the first time you run from Xcode).

3. **Glasses firmware**: SDK 0.8.0 needs firmware **V127** (check in Meta AI
   app → Devices → your glasses → About). The sample has built-in "Update
   firmware" / "Update app on glasses" flows if you're behind.

## Build & run

1. `open ios/DisplayAccess/DisplayAccess.xcodeproj`
2. First open: Xcode resolves the `meta-wearables-dat-ios` Swift package
   (pinned 0.8.0) — needs network, takes a minute.
3. Target **DisplayAccess** → **Signing & Capabilities** → check "Automatically
   manage signing" and pick your **personal team** (any free Apple ID works;
   apps signed with a free team expire after 7 days — just re-run).
4. Plug in your iPhone, select it as the run destination, hit **Run** (⌘R).
5. On the phone: tap **Register** → it deep-links into the Meta AI app →
   approve → bounces back. Your app now appears under Meta AI →
   App connections → Developer mode apps.
6. Tap **Try it** on the Car maintenance guide → content renders on the
   glasses. Swipe/pinch with the Neural Band to navigate it.

## Where the interesting code lives

| File | What it shows |
|---|---|
| `DisplayAccess/Samples/CarMaintenanceDisplay.swift` | Building glasses UI: FlexBox layouts, Text, Image, Button, video |
| `DisplayAccess/ViewModels/DisplayViewModel.swift` | Session + display lifecycle: `createSession` → `addDisplay` → `send(view)` |
| `DisplayAccess/ViewModels/WearablesViewModel.swift` | Registration, device list, link-state listeners |
| `DisplayAccess/Info.plist` | The required MWDAT config block (URL scheme, background modes, Bluetooth) |

The unmodified SDK clone (with the CameraAccess sample and the AI-assistant
plugins) is at `../ios-sdk/`. Meta also runs a no-auth docs MCP server at
`https://mcp.developer.meta.com/wearables`.

## Native vs. web app — when to use which

The native path gives you what web apps can't: **camera streaming, photo
capture, mic/speaker audio**, and phone-app integration (your app's logic and
data on the glasses). The trade-offs: UI is limited to Meta's component set
(FlexBox/Text/Button/Image/video — no free-form canvas), input arrives as
button focus/clicks rather than raw D-pad events, and the iterate loop is an
Xcode rebuild instead of a file save. For the teleprompter, the web app's
free-scrolling text is actually a better fit; go native when you want the
camera or audio.
