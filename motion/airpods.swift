// AirPods -> Sotto. Full 6-axis stream plus gestures.
//  nod=approve, shake=reject, tilt L/R = switch agent, look up = open diff, lean forward = zoom,
//  teeth/jaw double-click is not available on Apple's API, so a held look-down arms nothing (kept simple).
// Build into Sotto.app (needs NSMotionUsageDescription).
import CoreMotion
import Foundation

let mgr = CMHeadphoneMotionManager()
var win: [(t: Double, pitch: Double, yaw: Double, roll: Double)] = []
var lastFire = 0.0
var zero: (p: Double, y: Double, r: Double)? = nil
var vel = (x: 0.0, y: 0.0, z: 0.0), pos = (x: 0.0, y: 0.0, z: 0.0)
var lastT = 0.0, lastPose = 0.0, still = 0

func post(_ path: String, _ body: [String: Any]) {
    var r = URLRequest(url: URL(string: "http://127.0.0.1:8787" + path)!)
    r.httpMethod = "POST"; r.httpBody = try? JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: r).resume()
}
func fire(_ type: String) { post("/gesture", ["type": type, "source": "airpods"]); print(type); fflush(stdout) }
func swing(_ v: [Double]) -> Double { (v.max() ?? 0) - (v.min() ?? 0) }

guard mgr.isDeviceMotionAvailable else { print("no headphone motion available"); exit(1) }
mgr.startDeviceMotionUpdates(to: .main) { m, _ in
    guard let m = m else { return }
    let t = Date().timeIntervalSince1970, dt = lastT == 0 ? 0.0 : min(t - lastT, 0.1); lastT = t
    let p = m.attitude.pitch, y = m.attitude.yaw, r = m.attitude.roll
    if zero == nil { zero = (p, y, r) }
    // Position: integrate user acceleration (g -> m/s^2) with strong decay, so it only holds for short moves.
    let a = m.userAcceleration, g = 9.81
    let moving = abs(a.x) + abs(a.y) + abs(a.z) > 0.04
    still = moving ? 0 : still + 1
    let decay = still > 12 ? 0.80 : 0.995
    vel = (vel.x * decay + a.x * g * dt, vel.y * decay + a.y * g * dt, vel.z * decay + a.z * g * dt)
    pos = (pos.x * 0.9985 + vel.x * dt, pos.y * 0.9985 + vel.y * dt, pos.z * 0.9985 + vel.z * dt)
    if t - lastPose > 0.05 {   // 20 Hz pose stream for the page
        lastPose = t
        post("/pose", ["pitch": p - zero!.p, "yaw": y - zero!.y, "roll": r - zero!.r,
                       "x": pos.x, "y": pos.y, "z": pos.z, "ax": a.x, "ay": a.y, "az": a.z])
    }
    win.append((t, p, y, r)); win.removeAll { t - $0.t > 0.9 }
    guard t - lastFire > 1.0, win.count > 10 else { return }
    let sp = swing(win.map { $0.pitch }), sy = swing(win.map { $0.yaw }), sr = swing(win.map { $0.roll })
    if sp > 0.35 && sp > 1.6 * sy && sp > 1.6 * sr { lastFire = t; fire("nod") }
    else if sy > 0.45 && sy > 1.6 * sp { lastFire = t; fire("shake") }
    else if r - zero!.r > 0.38 && sp < 0.15 && sy < 0.2 { lastFire = t + 0.6; fire("tilt_right") }
    else if r - zero!.r < -0.38 && sp < 0.15 && sy < 0.2 { lastFire = t + 0.6; fire("tilt_left") }
    else if p - zero!.p > 0.5 && sp < 0.12 { lastFire = t + 0.8; fire("look_up") }
    if abs(pos.z) > 0.45 && t - lastFire > 1.5 { lastFire = t; fire(pos.z < 0 ? "lean_in" : "lean_back"); pos = (0, 0, 0); vel = (0, 0, 0) }
}
// recenter on stdin line or SIGUSR1
signal(SIGUSR1) { _ in zero = nil; pos = (0, 0, 0); vel = (0, 0, 0) }
print("listening: nod shake tilt look_up lean + pose stream"); fflush(stdout)
RunLoop.main.run()
