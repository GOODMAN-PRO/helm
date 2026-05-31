// guicontrol — tiny mouse/keyboard driver for SecondMe (replaces cliclick).
// Usage:
//   guicontrol click X Y          left click at screen coords
//   guicontrol doubleclick X Y
//   guicontrol rightclick X Y
//   guicontrol move X Y
//   guicontrol type "some text"   type into the focused field
//   guicontrol key CODE [mods]    press a virtual key code; mods = comma list: cmd,shift,opt,ctrl
//   guicontrol scroll DY          scroll vertically (positive = up)
// Requires Accessibility permission for whatever process launches it.
import Cocoa
import CoreGraphics
import ApplicationServices

let a = CommandLine.arguments
func die(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }
func num(_ i: Int) -> Double { i < a.count ? (Double(a[i]) ?? 0) : 0 }
func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }

func click(_ x: Double, _ y: Double, _ button: CGMouseButton, _ count: Int) {
  let p = CGPoint(x: x, y: y)
  let down: CGEventType = button == .right ? .rightMouseDown : .leftMouseDown
  let up:   CGEventType = button == .right ? .rightMouseUp   : .leftMouseUp
  for i in 1...count {
    let d = CGEvent(mouseEventSource: nil, mouseType: down, mouseCursorPosition: p, mouseButton: button)
    d?.setIntegerValueField(.mouseEventClickState, value: Int64(i)); post(d)
    let u = CGEvent(mouseEventSource: nil, mouseType: up, mouseCursorPosition: p, mouseButton: button)
    u?.setIntegerValueField(.mouseEventClickState, value: Int64(i)); post(u)
    usleep(40_000)
  }
}
func move(_ x: Double, _ y: Double) {
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left))
}
func typeText(_ s: String) {
  for ch in s {
    var u = Array(String(ch).utf16)
    let d = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)
    let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
    d?.keyboardSetUnicodeString(stringLength: u.count, unicodeString: &u)
    up?.keyboardSetUnicodeString(stringLength: u.count, unicodeString: &u)
    post(d); post(up); usleep(6_000)
  }
}
func flags(_ s: String?) -> CGEventFlags {
  var f: CGEventFlags = []
  for m in (s ?? "").split(separator: ",") {
    switch m { case "cmd": f.insert(.maskCommand); case "shift": f.insert(.maskShift)
      case "opt","alt": f.insert(.maskAlternate); case "ctrl": f.insert(.maskControl); default: break }
  }
  return f
}
func key(_ code: CGKeyCode, _ mods: CGEventFlags) {
  let d = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true);  d?.flags = mods; post(d)
  let u = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false); u?.flags = mods; post(u)
}

guard a.count > 1 else { die("usage: click|doubleclick|rightclick|move X Y | type \"text\" | key CODE [mods] | scroll DY") }
switch a[1] {
case "click":        click(num(2), num(3), .left, 1)
case "doubleclick":  click(num(2), num(3), .left, 2)
case "rightclick":   click(num(2), num(3), .right, 1)
case "move":         move(num(2), num(3))
case "type":         guard a.count > 2 else { die("type needs text") }; typeText(a[2])
case "key":          key(CGKeyCode(Int(num(2))), flags(a.count > 3 ? a[3] : nil))
case "scroll":       post(CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: Int32(num(2)), wheel2: 0, wheel3: 0))
case "trusted":      print(AXIsProcessTrusted() ? "ACCESSIBILITY_OK" : "ACCESSIBILITY_DENIED")
case "pos":          if let p = CGEvent(source: nil)?.location { print("\(Int(p.x)),\(Int(p.y))") } else { print("unknown") }
default:             die("unknown command: \(a[1])")
}
