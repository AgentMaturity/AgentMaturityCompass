"use strict";

// Requiring this optional package does not load or build the native binding.
exports.loadPkcs11 = () => require("pkcs11js");
