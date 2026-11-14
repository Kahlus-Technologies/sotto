// AirPods head gestures -> Sotto. Nod (pitch) = approve, shake (yaw) = reject.
// Build: swiftc -O airpods.swift -o airpods && ./airpods   (needs AirPods Pro/Max in ears)
import CoreMotion
import Foundation

let mgr = CMHeadphoneMotionManager()
var win: [(t: Double, pitch: Double, yaw: Double)] = []
var lastFire = 0.0

func post(_ type: String) {
    var r = URLRequest(url: URL(string: "http://127.0.0.1:8787/gesture")!)
    r.httpMethod = "POST"
    r.httpBody = try? JSONSerialization.data(withJSONObject: ["type": type, "source": "airpods"])
    URLSession.shared.dataTask(with: r).resume()
    print(type); fflush(stdout)
}

// Swing = peak-to-peak in the last 0.9s. Nod: big pitch swing, small yaw. Shake: the reverse.
func swing(_ v: [Double]) -> Double { (v.max() ?? 0) - (v.min() ?? 0) }

guard mgr.isDeviceMotionAvailable else { print("no headphone motion available"); exit(1) }
mgr.startDeviceMotionUpdates(to: .main) { m, _ in
    guard let m = m else { return }
    let t = Date().timeIntervalSince1970
    win.append((t, m.attitude.pitch, m.attitude.yaw))
    win.removeAll { t - $0.t > 0.9 }
    guard t - lastFire > 1.2, win.count > 10 else { return }
    let p = swing(win.map { $0.pitch }), y = swing(win.map { $0.yaw })
    if p > 0.35 && p > 1.6 * y { lastFire = t; post("nod") }
    else if y > 0.45 && y > 1.6 * p { lastFire = t; post("shake") }
}
print("listening for nod / shake"); fflush(stdout)
RunLoop.main.run()
