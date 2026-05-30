// OCR helper using macOS Vision framework.
// Compile:
//   swiftc ocr-helper.swift -o /Users/owner/secondme/bin/ocr-helper
// Usage:
//   ocr-helper /path/to/image.png
// Output: recognised text on stdout, one line per observation.
//
// If swiftc is not available (Command Line Tools not installed):
//   xcode-select --install

import Vision
import Foundation
import AppKit
import CoreGraphics

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: ocr-helper <image.png>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
var rect = CGRect.zero
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    fputs("ocr-helper: cannot load image: \(imagePath)\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("ocr-helper: VNImageRequestHandler failed: \(error)\n", stderr)
    exit(1)
}

let observations = request.results ?? []
let lines = observations.compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
