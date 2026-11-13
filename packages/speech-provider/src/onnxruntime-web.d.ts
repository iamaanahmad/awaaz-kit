// Shorthand ambient declaration so the lazy `import("onnxruntime-web")` type-checks before the
// dependency is installed. The adapter casts the module to its own minimal `OrtLike` shape.
declare module 'onnxruntime-web';
