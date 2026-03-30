import { t as __exportAll } from "./chunk-CfYAbeIz.mjs";
//#region src/parser/utils.ts
const TypedArrayPrototypeGetSymbolToStringTag = (() => {
	const g = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
	return (value) => g.call(value);
})();
function isUint8Array(value) {
	return TypedArrayPrototypeGetSymbolToStringTag(value) === "Uint8Array";
}
function isAnyArrayBuffer(value) {
	return typeof value === "object" && value != null && Symbol.toStringTag in value && (value[Symbol.toStringTag] === "ArrayBuffer" || value[Symbol.toStringTag] === "SharedArrayBuffer");
}
function isRegExp(regexp) {
	return regexp instanceof RegExp || Object.prototype.toString.call(regexp) === "[object RegExp]";
}
function isMap(value) {
	return typeof value === "object" && value != null && Symbol.toStringTag in value && value[Symbol.toStringTag] === "Map";
}
function isDate(date) {
	return date instanceof Date || Object.prototype.toString.call(date) === "[object Date]";
}
function defaultInspect(x, _options) {
	return JSON.stringify(x, (k, v) => {
		if (typeof v === "bigint") return { $numberLong: `${v}` };
		else if (isMap(v)) return Object.fromEntries(v);
		return v;
	});
}
/** @internal */
function getStylizeFunction(options) {
	if (options != null && typeof options === "object" && "stylize" in options && typeof options.stylize === "function") return options.stylize;
}
/** @internal */
const BSON_VERSION_SYMBOL = Symbol.for("@@mdb.bson.version");
/** @internal */
const BSON_INT64_MAX = Math.pow(2, 63) - 1;
/** @internal */
const BSON_INT64_MIN = -Math.pow(2, 63);
/**
* Any integer up to 2^53 can be precisely represented by a double.
* @internal
*/
const JS_INT_MAX = Math.pow(2, 53);
/**
* Any integer down to -2^53 can be precisely represented by a double.
* @internal
*/
const JS_INT_MIN = -Math.pow(2, 53);
/** @public */
const BSONType = Object.freeze({
	double: 1,
	string: 2,
	object: 3,
	array: 4,
	binData: 5,
	undefined: 6,
	objectId: 7,
	bool: 8,
	date: 9,
	null: 10,
	regex: 11,
	dbPointer: 12,
	javascript: 13,
	symbol: 14,
	javascriptWithScope: 15,
	int: 16,
	timestamp: 17,
	long: 18,
	decimal: 19,
	minKey: -1,
	maxKey: 127
});
//#endregion
//#region src/error.ts
/**
* @public
* @category Error
*
* `BSONError` objects are thrown when BSON encounters an error.
*
* This is the parent class for all the other errors thrown by this library.
*/
var BSONError = class extends Error {
	/**
	* @internal
	* The underlying algorithm for isBSONError may change to improve how strict it is
	* about determining if an input is a BSONError. But it must remain backwards compatible
	* with previous minors & patches of the current major version.
	*/
	get bsonError() {
		return true;
	}
	get name() {
		return "BSONError";
	}
	constructor(message, options) {
		super(message, options);
	}
	/**
	* @public
	*
	* All errors thrown from the BSON library inherit from `BSONError`.
	* This method can assist with determining if an error originates from the BSON library
	* even if it does not pass an `instanceof` check against this class' constructor.
	*
	* @param value - any javascript value that needs type checking
	*/
	static isBSONError(value) {
		return value != null && typeof value === "object" && "bsonError" in value && value.bsonError === true && "name" in value && "message" in value && "stack" in value;
	}
};
/**
* @public
* @category Error
*/
var BSONVersionError = class extends BSONError {
	get name() {
		return "BSONVersionError";
	}
	constructor() {
		super(`Unsupported BSON version, bson types must be from bson 7.x.x`);
	}
};
/**
* @public
* @category Error
*
* An error generated when BSON functions encounter an unexpected input
* or reaches an unexpected/invalid internal state
*
*/
var BSONRuntimeError = class extends BSONError {
	get name() {
		return "BSONRuntimeError";
	}
	constructor(message) {
		super(message);
	}
};
/**
* @public
* @category Error
*
* @experimental
*
* An error generated when BSON bytes are invalid.
* Reports the offset the parser was able to reach before encountering the error.
*/
var BSONOffsetError = class extends BSONError {
	get name() {
		return "BSONOffsetError";
	}
	offset;
	constructor(message, offset, options) {
		super(`${message}. offset: ${offset}`, options);
		this.offset = offset;
	}
};
//#endregion
//#region src/parse_utf8.ts
let TextDecoderFatal;
let TextDecoderNonFatal;
/**
* Determines if the passed in bytes are valid utf8
* @param bytes - An array of 8-bit bytes. Must be indexable and have length property
* @param start - The index to start validating
* @param end - The index to end validating
*/
function parseUtf8(buffer, start, end, fatal) {
	if (fatal) {
		TextDecoderFatal ??= new TextDecoder("utf8", { fatal: true });
		try {
			return TextDecoderFatal.decode(buffer.subarray(start, end));
		} catch (cause) {
			throw new BSONError("Invalid UTF-8 string in BSON document", { cause });
		}
	}
	TextDecoderNonFatal ??= new TextDecoder("utf8", { fatal: false });
	return TextDecoderNonFatal.decode(buffer.subarray(start, end));
}
//#endregion
//#region src/utils/latin.ts
/**
* This function is an optimization for small basic latin strings.
* @internal
* @remarks
* ### Important characteristics:
* - If the uint8array or distance between start and end is 0 this function returns an empty string
* - If the byteLength of the string is 1, 2, or 3 we invoke String.fromCharCode and manually offset into the buffer
* - If the byteLength of the string is less than or equal to 20 an array of bytes is built and `String.fromCharCode.apply` is called with the result
* - If any byte exceeds 128 this function returns null
*
* @param uint8array - A sequence of bytes that may contain basic latin characters
* @param start - The start index from which to search the uint8array
* @param end - The index to stop searching the uint8array
* @returns string if all bytes are within the basic latin range, otherwise null
*/
function tryReadBasicLatin(uint8array, start, end) {
	if (uint8array.length === 0) return "";
	const stringByteLength = end - start;
	if (stringByteLength === 0) return "";
	if (stringByteLength > 20) return null;
	if (stringByteLength === 1 && uint8array[start] < 128) return String.fromCharCode(uint8array[start]);
	if (stringByteLength === 2 && uint8array[start] < 128 && uint8array[start + 1] < 128) return String.fromCharCode(uint8array[start]) + String.fromCharCode(uint8array[start + 1]);
	if (stringByteLength === 3 && uint8array[start] < 128 && uint8array[start + 1] < 128 && uint8array[start + 2] < 128) return String.fromCharCode(uint8array[start]) + String.fromCharCode(uint8array[start + 1]) + String.fromCharCode(uint8array[start + 2]);
	const latinBytes = [];
	for (let i = start; i < end; i++) {
		const byte = uint8array[i];
		if (byte > 127) return null;
		latinBytes.push(byte);
	}
	return String.fromCharCode(...latinBytes);
}
/**
* This function is an optimization for writing small basic latin strings.
* @internal
* @remarks
* ### Important characteristics:
* - If the string length is 0 return 0, do not perform any work
* - If a string is longer than 25 code units return null
* - If any code unit exceeds 128 this function returns null
*
* @param destination - The uint8array to serialize the string to
* @param source - The string to turn into UTF-8 bytes if it fits in the basic latin range
* @param offset - The position in the destination to begin writing bytes to
* @returns the number of bytes written to destination if all code units are below 128, otherwise null
*/
function tryWriteBasicLatin(destination, source, offset) {
	if (source.length === 0) return 0;
	if (source.length > 25) return null;
	if (destination.length - offset < source.length) return null;
	for (let charOffset = 0, destinationOffset = offset; charOffset < source.length; charOffset++, destinationOffset++) {
		const char = source.charCodeAt(charOffset);
		if (char > 127) return null;
		destination[destinationOffset] = char;
	}
	return source.length;
}
//#endregion
//#region src/utils/node_byte_utils.ts
/** @internal */
function nodejsMathRandomBytes(byteLength) {
	return nodeJsByteUtils.fromNumberArray(Array.from({ length: byteLength }, () => Math.floor(Math.random() * 256)));
}
/** @internal */
function nodejsSecureRandomBytes(byteLength) {
	return crypto.getRandomValues(nodeJsByteUtils.allocate(byteLength));
}
/**
* @public
* @experimental
*/
const nodeJsByteUtils = {
	isUint8Array,
	toLocalBufferType(potentialBuffer) {
		if (Buffer.isBuffer(potentialBuffer)) return potentialBuffer;
		if (ArrayBuffer.isView(potentialBuffer)) return Buffer.from(potentialBuffer.buffer, potentialBuffer.byteOffset, potentialBuffer.byteLength);
		const stringTag = potentialBuffer?.[Symbol.toStringTag] ?? Object.prototype.toString.call(potentialBuffer);
		if (stringTag === "ArrayBuffer" || stringTag === "SharedArrayBuffer" || stringTag === "[object ArrayBuffer]" || stringTag === "[object SharedArrayBuffer]") return Buffer.from(potentialBuffer);
		throw new BSONError(`Cannot create Buffer from the passed potentialBuffer.`);
	},
	allocate(size) {
		return Buffer.alloc(size);
	},
	allocateUnsafe(size) {
		return Buffer.allocUnsafe(size);
	},
	compare(a, b) {
		return nodeJsByteUtils.toLocalBufferType(a).compare(b);
	},
	concat(list) {
		return Buffer.concat(list);
	},
	copy(source, target, targetStart, sourceStart, sourceEnd) {
		return nodeJsByteUtils.toLocalBufferType(source).copy(target, targetStart ?? 0, sourceStart ?? 0, sourceEnd ?? source.length);
	},
	equals(a, b) {
		return nodeJsByteUtils.toLocalBufferType(a).equals(b);
	},
	fromNumberArray(array) {
		return Buffer.from(array);
	},
	fromBase64(base64) {
		return Buffer.from(base64, "base64");
	},
	fromUTF8(utf8) {
		return Buffer.from(utf8, "utf8");
	},
	toBase64(buffer) {
		return nodeJsByteUtils.toLocalBufferType(buffer).toString("base64");
	},
	fromISO88591(codePoints) {
		return Buffer.from(codePoints, "binary");
	},
	toISO88591(buffer) {
		return nodeJsByteUtils.toLocalBufferType(buffer).toString("binary");
	},
	fromHex(hex) {
		return Buffer.from(hex, "hex");
	},
	toHex(buffer) {
		return nodeJsByteUtils.toLocalBufferType(buffer).toString("hex");
	},
	toUTF8(buffer, start, end, fatal) {
		const basicLatin = end - start <= 20 ? tryReadBasicLatin(buffer, start, end) : null;
		if (basicLatin != null) return basicLatin;
		const string = nodeJsByteUtils.toLocalBufferType(buffer).toString("utf8", start, end);
		if (fatal) {
			for (let i = 0; i < string.length; i++) if (string.charCodeAt(i) === 65533) {
				parseUtf8(buffer, start, end, true);
				break;
			}
		}
		return string;
	},
	utf8ByteLength(input) {
		return Buffer.byteLength(input, "utf8");
	},
	encodeUTF8Into(buffer, source, byteOffset) {
		const latinBytesWritten = tryWriteBasicLatin(buffer, source, byteOffset);
		if (latinBytesWritten != null) return latinBytesWritten;
		return nodeJsByteUtils.toLocalBufferType(buffer).write(source, byteOffset, void 0, "utf8");
	},
	randomBytes: (() => {
		const { crypto } = globalThis;
		if (crypto != null && typeof crypto.getRandomValues === "function") return nodejsSecureRandomBytes;
		else return nodejsMathRandomBytes;
	})(),
	swap32(buffer) {
		return nodeJsByteUtils.toLocalBufferType(buffer).swap32();
	}
};
//#endregion
//#region src/utils/web_byte_utils.ts
function isReactNative() {
	const { navigator } = globalThis;
	return typeof navigator === "object" && navigator.product === "ReactNative";
}
/** @internal */
function webMathRandomBytes(byteLength) {
	if (byteLength < 0) throw new RangeError(`The argument 'byteLength' is invalid. Received ${byteLength}`);
	return webByteUtils.fromNumberArray(Array.from({ length: byteLength }, () => Math.floor(Math.random() * 256)));
}
/** @internal */
const webRandomBytes = (() => {
	const { crypto } = globalThis;
	if (crypto != null && typeof crypto.getRandomValues === "function") return (byteLength) => {
		return crypto.getRandomValues(webByteUtils.allocate(byteLength));
	};
	else {
		if (isReactNative()) {
			const { console } = globalThis;
			console?.warn?.("BSON: For React Native please polyfill crypto.getRandomValues, e.g. using: https://www.npmjs.com/package/react-native-get-random-values.");
		}
		return webMathRandomBytes;
	}
})();
const HEX_DIGIT = /(\d|[a-f])/i;
/**
* @public
* @experimental
*/
const webByteUtils = {
	isUint8Array,
	toLocalBufferType(potentialUint8array) {
		const stringTag = potentialUint8array?.[Symbol.toStringTag] ?? Object.prototype.toString.call(potentialUint8array);
		if (stringTag === "Uint8Array") return potentialUint8array;
		if (ArrayBuffer.isView(potentialUint8array)) return new Uint8Array(potentialUint8array.buffer.slice(potentialUint8array.byteOffset, potentialUint8array.byteOffset + potentialUint8array.byteLength));
		if (stringTag === "ArrayBuffer" || stringTag === "SharedArrayBuffer" || stringTag === "[object ArrayBuffer]" || stringTag === "[object SharedArrayBuffer]") return new Uint8Array(potentialUint8array);
		throw new BSONError(`Cannot make a Uint8Array from passed potentialBuffer.`);
	},
	allocate(size) {
		if (typeof size !== "number") throw new TypeError(`The "size" argument must be of type number. Received ${String(size)}`);
		return new Uint8Array(size);
	},
	allocateUnsafe(size) {
		return webByteUtils.allocate(size);
	},
	compare(uint8Array, otherUint8Array) {
		if (uint8Array === otherUint8Array) return 0;
		const len = Math.min(uint8Array.length, otherUint8Array.length);
		for (let i = 0; i < len; i++) {
			if (uint8Array[i] < otherUint8Array[i]) return -1;
			if (uint8Array[i] > otherUint8Array[i]) return 1;
		}
		if (uint8Array.length < otherUint8Array.length) return -1;
		if (uint8Array.length > otherUint8Array.length) return 1;
		return 0;
	},
	concat(uint8Arrays) {
		if (uint8Arrays.length === 0) return webByteUtils.allocate(0);
		let totalLength = 0;
		for (const uint8Array of uint8Arrays) totalLength += uint8Array.length;
		const result = webByteUtils.allocate(totalLength);
		let offset = 0;
		for (const uint8Array of uint8Arrays) {
			result.set(uint8Array, offset);
			offset += uint8Array.length;
		}
		return result;
	},
	copy(source, target, targetStart, sourceStart, sourceEnd) {
		if (sourceEnd !== void 0 && sourceEnd < 0) throw new RangeError(`The value of "sourceEnd" is out of range. It must be >= 0. Received ${sourceEnd}`);
		sourceEnd = sourceEnd ?? source.length;
		if (sourceStart !== void 0 && (sourceStart < 0 || sourceStart > sourceEnd)) throw new RangeError(`The value of "sourceStart" is out of range. It must be >= 0 and <= ${sourceEnd}. Received ${sourceStart}`);
		sourceStart = sourceStart ?? 0;
		if (targetStart !== void 0 && targetStart < 0) throw new RangeError(`The value of "targetStart" is out of range. It must be >= 0. Received ${targetStart}`);
		targetStart = targetStart ?? 0;
		const srcSlice = source.subarray(sourceStart, sourceEnd);
		const maxLen = Math.min(srcSlice.length, target.length - targetStart);
		if (maxLen <= 0) return 0;
		target.set(srcSlice.subarray(0, maxLen), targetStart);
		return maxLen;
	},
	equals(uint8Array, otherUint8Array) {
		if (uint8Array.byteLength !== otherUint8Array.byteLength) return false;
		for (let i = 0; i < uint8Array.byteLength; i++) if (uint8Array[i] !== otherUint8Array[i]) return false;
		return true;
	},
	fromNumberArray(array) {
		return Uint8Array.from(array);
	},
	fromBase64(base64) {
		return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	},
	fromUTF8(utf8) {
		return new TextEncoder().encode(utf8);
	},
	toBase64(uint8array) {
		return btoa(webByteUtils.toISO88591(uint8array));
	},
	fromISO88591(codePoints) {
		return Uint8Array.from(codePoints, (c) => c.charCodeAt(0) & 255);
	},
	toISO88591(uint8array) {
		return Array.from(Uint16Array.from(uint8array), (b) => String.fromCharCode(b)).join("");
	},
	fromHex(hex) {
		const evenLengthHex = hex.length % 2 === 0 ? hex : hex.slice(0, hex.length - 1);
		const buffer = [];
		for (let i = 0; i < evenLengthHex.length; i += 2) {
			const firstDigit = evenLengthHex[i];
			const secondDigit = evenLengthHex[i + 1];
			if (!HEX_DIGIT.test(firstDigit)) break;
			if (!HEX_DIGIT.test(secondDigit)) break;
			const hexDigit = Number.parseInt(`${firstDigit}${secondDigit}`, 16);
			buffer.push(hexDigit);
		}
		return Uint8Array.from(buffer);
	},
	toHex(uint8array) {
		return Array.from(uint8array, (byte) => byte.toString(16).padStart(2, "0")).join("");
	},
	toUTF8(uint8array, start, end, fatal) {
		const basicLatin = end - start <= 20 ? tryReadBasicLatin(uint8array, start, end) : null;
		if (basicLatin != null) return basicLatin;
		return parseUtf8(uint8array, start, end, fatal);
	},
	utf8ByteLength(input) {
		return new TextEncoder().encode(input).byteLength;
	},
	encodeUTF8Into(uint8array, source, byteOffset) {
		const bytes = new TextEncoder().encode(source);
		uint8array.set(bytes, byteOffset);
		return bytes.byteLength;
	},
	randomBytes: webRandomBytes,
	swap32(buffer) {
		if (buffer.length % 4 !== 0) throw new RangeError("Buffer size must be a multiple of 32-bits");
		for (let i = 0; i < buffer.length; i += 4) {
			const byte0 = buffer[i];
			const byte1 = buffer[i + 1];
			const byte2 = buffer[i + 2];
			buffer[i] = buffer[i + 3];
			buffer[i + 1] = byte2;
			buffer[i + 2] = byte1;
			buffer[i + 3] = byte0;
		}
		return buffer;
	}
};
/**
* This is the only ByteUtils that should be used across the rest of the BSON library.
*
* The type annotation is important here, it asserts that each of the platform specific
* utils implementations are compatible with the common one.
*
* @public
* @experimental
*/
const ByteUtils = typeof Buffer === "function" && Buffer.prototype?._isBuffer !== true ? nodeJsByteUtils : webByteUtils;
//#endregion
//#region src/bson_value.ts
/** @public */
const bsonType = Symbol.for("@@mdb.bson.type");
/** @public */
var BSONValue = class {
	get [bsonType]() {
		return this._bsontype;
	}
	/** @internal */
	get [BSON_VERSION_SYMBOL]() {
		return 7;
	}
	[Symbol.for("nodejs.util.inspect.custom")](depth, options, inspect) {
		return this.inspect(depth, options, inspect);
	}
};
//#endregion
//#region src/utils/number_utils.ts
const FLOAT = new Float64Array(1);
const FLOAT_BYTES = new Uint8Array(FLOAT.buffer, 0, 8);
FLOAT[0] = -1;
const isBigEndian = FLOAT_BYTES[7] === 0;
/**
* Number parsing and serializing utilities.
*
* @experimental
* @public
*/
const NumberUtils = {
	isBigEndian,
	getNonnegativeInt32LE(source, offset) {
		if (source[offset + 3] > 127) throw new RangeError(`Size cannot be negative at offset: ${offset}`);
		return source[offset] | source[offset + 1] << 8 | source[offset + 2] << 16 | source[offset + 3] << 24;
	},
	getInt32LE(source, offset) {
		return source[offset] | source[offset + 1] << 8 | source[offset + 2] << 16 | source[offset + 3] << 24;
	},
	getUint32LE(source, offset) {
		return source[offset] + source[offset + 1] * 256 + source[offset + 2] * 65536 + source[offset + 3] * 16777216;
	},
	getUint32BE(source, offset) {
		return source[offset + 3] + source[offset + 2] * 256 + source[offset + 1] * 65536 + source[offset] * 16777216;
	},
	getBigInt64LE(source, offset) {
		const hi = BigInt(source[offset + 4] + source[offset + 5] * 256 + source[offset + 6] * 65536 + (source[offset + 7] << 24));
		const lo = BigInt(source[offset] + source[offset + 1] * 256 + source[offset + 2] * 65536 + source[offset + 3] * 16777216);
		return (hi << 32n) + lo;
	},
	getFloat64LE: isBigEndian ? (source, offset) => {
		FLOAT_BYTES[7] = source[offset];
		FLOAT_BYTES[6] = source[offset + 1];
		FLOAT_BYTES[5] = source[offset + 2];
		FLOAT_BYTES[4] = source[offset + 3];
		FLOAT_BYTES[3] = source[offset + 4];
		FLOAT_BYTES[2] = source[offset + 5];
		FLOAT_BYTES[1] = source[offset + 6];
		FLOAT_BYTES[0] = source[offset + 7];
		return FLOAT[0];
	} : (source, offset) => {
		FLOAT_BYTES[0] = source[offset];
		FLOAT_BYTES[1] = source[offset + 1];
		FLOAT_BYTES[2] = source[offset + 2];
		FLOAT_BYTES[3] = source[offset + 3];
		FLOAT_BYTES[4] = source[offset + 4];
		FLOAT_BYTES[5] = source[offset + 5];
		FLOAT_BYTES[6] = source[offset + 6];
		FLOAT_BYTES[7] = source[offset + 7];
		return FLOAT[0];
	},
	setInt32BE(destination, offset, value) {
		destination[offset + 3] = value;
		value >>>= 8;
		destination[offset + 2] = value;
		value >>>= 8;
		destination[offset + 1] = value;
		value >>>= 8;
		destination[offset] = value;
		return 4;
	},
	setInt32LE(destination, offset, value) {
		destination[offset] = value;
		value >>>= 8;
		destination[offset + 1] = value;
		value >>>= 8;
		destination[offset + 2] = value;
		value >>>= 8;
		destination[offset + 3] = value;
		return 4;
	},
	setBigInt64LE(destination, offset, value) {
		const mask32bits = 4294967295n;
		/** lower 32 bits */
		let lo = Number(value & mask32bits);
		destination[offset] = lo;
		lo >>= 8;
		destination[offset + 1] = lo;
		lo >>= 8;
		destination[offset + 2] = lo;
		lo >>= 8;
		destination[offset + 3] = lo;
		let hi = Number(value >> 32n & mask32bits);
		destination[offset + 4] = hi;
		hi >>= 8;
		destination[offset + 5] = hi;
		hi >>= 8;
		destination[offset + 6] = hi;
		hi >>= 8;
		destination[offset + 7] = hi;
		return 8;
	},
	setFloat64LE: isBigEndian ? (destination, offset, value) => {
		FLOAT[0] = value;
		destination[offset] = FLOAT_BYTES[7];
		destination[offset + 1] = FLOAT_BYTES[6];
		destination[offset + 2] = FLOAT_BYTES[5];
		destination[offset + 3] = FLOAT_BYTES[4];
		destination[offset + 4] = FLOAT_BYTES[3];
		destination[offset + 5] = FLOAT_BYTES[2];
		destination[offset + 6] = FLOAT_BYTES[1];
		destination[offset + 7] = FLOAT_BYTES[0];
		return 8;
	} : (destination, offset, value) => {
		FLOAT[0] = value;
		destination[offset] = FLOAT_BYTES[0];
		destination[offset + 1] = FLOAT_BYTES[1];
		destination[offset + 2] = FLOAT_BYTES[2];
		destination[offset + 3] = FLOAT_BYTES[3];
		destination[offset + 4] = FLOAT_BYTES[4];
		destination[offset + 5] = FLOAT_BYTES[5];
		destination[offset + 6] = FLOAT_BYTES[6];
		destination[offset + 7] = FLOAT_BYTES[7];
		return 8;
	}
};
//#endregion
//#region src/binary.ts
/**
* A class representation of the BSON Binary type.
* @public
* @category BSONType
*/
var Binary = class Binary extends BSONValue {
	get _bsontype() {
		return "Binary";
	}
	/**
	* Binary default subtype
	* @internal
	*/
	static BSON_BINARY_SUBTYPE_DEFAULT = 0;
	/** Initial buffer default size */
	static BUFFER_SIZE = 256;
	/** Default BSON type */
	static SUBTYPE_DEFAULT = 0;
	/** Function BSON type */
	static SUBTYPE_FUNCTION = 1;
	/**
	* Legacy default BSON Binary type
	* @deprecated BSON Binary subtype 2 is deprecated in the BSON specification
	*/
	static SUBTYPE_BYTE_ARRAY = 2;
	/** Deprecated UUID BSON type @deprecated Please use SUBTYPE_UUID */
	static SUBTYPE_UUID_OLD = 3;
	/** UUID BSON type */
	static SUBTYPE_UUID = 4;
	/** MD5 BSON type */
	static SUBTYPE_MD5 = 5;
	/** Encrypted BSON type */
	static SUBTYPE_ENCRYPTED = 6;
	/** Column BSON type */
	static SUBTYPE_COLUMN = 7;
	/** Sensitive BSON type */
	static SUBTYPE_SENSITIVE = 8;
	/** Vector BSON type */
	static SUBTYPE_VECTOR = 9;
	/** User BSON type */
	static SUBTYPE_USER_DEFINED = 128;
	/** datatype of a Binary Vector (subtype: 9) */
	static VECTOR_TYPE = Object.freeze({
		Int8: 3,
		Float32: 39,
		PackedBit: 16
	});
	/**
	* The bytes of the Binary value.
	*
	* The format of a Binary value in BSON is defined as:
	* ```txt
	* binary	::= int32 subtype (byte*)
	* ```
	*
	* This `buffer` is the "(byte*)" segment.
	*
	* Unless the value is subtype 2, then deserialize will read the first 4 bytes as an int32 and set this to the remaining bytes.
	*
	* ```txt
	* binary	::= int32 unsigned_byte(2) int32 (byte*)
	* ```
	*
	* @see https://bsonspec.org/spec.html
	*/
	buffer;
	/**
	* The binary subtype.
	*
	* Current defined values are:
	*
	* - `unsigned_byte(0)` Generic binary subtype
	* - `unsigned_byte(1)` Function
	* - `unsigned_byte(2)` Binary (Deprecated)
	* - `unsigned_byte(3)` UUID (Deprecated)
	* - `unsigned_byte(4)` UUID
	* - `unsigned_byte(5)` MD5
	* - `unsigned_byte(6)` Encrypted BSON value
	* - `unsigned_byte(7)` Compressed BSON column
	* - `unsigned_byte(8)` Sensitive
	* - `unsigned_byte(9)` Vector
	* - `unsigned_byte(128)` - `unsigned_byte(255)` User defined
	*/
	sub_type;
	/**
	* The Binary's `buffer` can be larger than the Binary's content.
	* This property is used to determine where the content ends in the buffer.
	*/
	position;
	/**
	* Create a new Binary instance.
	* @param buffer - a buffer object containing the binary data.
	* @param subType - the option binary type.
	*/
	constructor(buffer, subType) {
		super();
		if (!(buffer == null) && typeof buffer === "string" && !ArrayBuffer.isView(buffer) && !isAnyArrayBuffer(buffer) && !Array.isArray(buffer)) throw new BSONError("Binary can only be constructed from Uint8Array or number[]");
		this.sub_type = subType ?? Binary.BSON_BINARY_SUBTYPE_DEFAULT;
		if (buffer == null) {
			this.buffer = ByteUtils.allocate(Binary.BUFFER_SIZE);
			this.position = 0;
		} else {
			this.buffer = Array.isArray(buffer) ? ByteUtils.fromNumberArray(buffer) : ByteUtils.toLocalBufferType(buffer);
			this.position = this.buffer.byteLength;
		}
	}
	/**
	* Updates this binary with byte_value.
	*
	* @param byteValue - a single byte we wish to write.
	*/
	put(byteValue) {
		if (typeof byteValue === "string" && byteValue.length !== 1) throw new BSONError("only accepts single character String");
		else if (typeof byteValue !== "number" && byteValue.length !== 1) throw new BSONError("only accepts single character Uint8Array or Array");
		let decodedByte;
		if (typeof byteValue === "string") decodedByte = byteValue.charCodeAt(0);
		else if (typeof byteValue === "number") decodedByte = byteValue;
		else decodedByte = byteValue[0];
		if (decodedByte < 0 || decodedByte > 255) throw new BSONError("only accepts number in a valid unsigned byte range 0-255");
		if (this.buffer.byteLength > this.position) this.buffer[this.position++] = decodedByte;
		else {
			const newSpace = ByteUtils.allocate(Binary.BUFFER_SIZE + this.buffer.length);
			newSpace.set(this.buffer, 0);
			this.buffer = newSpace;
			this.buffer[this.position++] = decodedByte;
		}
	}
	/**
	* Writes a buffer to the binary.
	*
	* @param sequence - a string or buffer to be written to the Binary BSON object.
	* @param offset - specify the binary of where to write the content.
	*/
	write(sequence, offset) {
		offset = typeof offset === "number" ? offset : this.position;
		if (this.buffer.byteLength < offset + sequence.length) {
			const newSpace = ByteUtils.allocate(this.buffer.byteLength + sequence.length);
			newSpace.set(this.buffer, 0);
			this.buffer = newSpace;
		}
		if (ArrayBuffer.isView(sequence)) {
			this.buffer.set(ByteUtils.toLocalBufferType(sequence), offset);
			this.position = offset + sequence.byteLength > this.position ? offset + sequence.length : this.position;
		} else if (typeof sequence === "string") throw new BSONError("input cannot be string");
	}
	/**
	* Returns a view of **length** bytes starting at **position**.
	*
	* @param position - read from the given position in the Binary.
	* @param length - the number of bytes to read.
	*/
	read(position, length) {
		length = length && length > 0 ? length : this.position;
		const end = position + length;
		return this.buffer.subarray(position, end > this.position ? this.position : end);
	}
	/** returns a view of the binary value as a Uint8Array */
	value() {
		return this.buffer.length === this.position ? this.buffer : this.buffer.subarray(0, this.position);
	}
	/** the length of the binary sequence */
	length() {
		return this.position;
	}
	toJSON() {
		return ByteUtils.toBase64(this.buffer.subarray(0, this.position));
	}
	toString(encoding) {
		if (encoding === "hex") return ByteUtils.toHex(this.buffer.subarray(0, this.position));
		if (encoding === "base64") return ByteUtils.toBase64(this.buffer.subarray(0, this.position));
		if (encoding === "utf8" || encoding === "utf-8") return ByteUtils.toUTF8(this.buffer, 0, this.position, false);
		return ByteUtils.toUTF8(this.buffer, 0, this.position, false);
	}
	/** @internal */
	toExtendedJSON(options) {
		options = options || {};
		if (this.sub_type === Binary.SUBTYPE_VECTOR) validateBinaryVector(this);
		const base64String = ByteUtils.toBase64(this.buffer);
		const subType = Number(this.sub_type).toString(16);
		if (options.legacy) return {
			$binary: base64String,
			$type: subType.length === 1 ? "0" + subType : subType
		};
		return { $binary: {
			base64: base64String,
			subType: subType.length === 1 ? "0" + subType : subType
		} };
	}
	toUUID() {
		if (this.sub_type === Binary.SUBTYPE_UUID) return new UUID(this.buffer.subarray(0, this.position));
		throw new BSONError(`Binary sub_type "${this.sub_type}" is not supported for converting to UUID. Only "${Binary.SUBTYPE_UUID}" is currently supported.`);
	}
	/** Creates an Binary instance from a hex digit string */
	static createFromHexString(hex, subType) {
		return new Binary(ByteUtils.fromHex(hex), subType);
	}
	/** Creates an Binary instance from a base64 string */
	static createFromBase64(base64, subType) {
		return new Binary(ByteUtils.fromBase64(base64), subType);
	}
	/** @internal */
	static fromExtendedJSON(doc, options) {
		options = options || {};
		let data;
		let type;
		if ("$binary" in doc) {
			if (options.legacy && typeof doc.$binary === "string" && "$type" in doc) {
				type = doc.$type ? parseInt(doc.$type, 16) : 0;
				data = ByteUtils.fromBase64(doc.$binary);
			} else if (typeof doc.$binary !== "string") {
				type = doc.$binary.subType ? parseInt(doc.$binary.subType, 16) : 0;
				data = ByteUtils.fromBase64(doc.$binary.base64);
			}
		} else if ("$uuid" in doc) {
			type = 4;
			data = UUID.bytesFromString(doc.$uuid);
		}
		if (!data) throw new BSONError(`Unexpected Binary Extended JSON format ${JSON.stringify(doc)}`);
		return type === 4 ? new UUID(data) : new Binary(data, type);
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		const base64 = ByteUtils.toBase64(this.buffer.subarray(0, this.position));
		return `Binary.createFromBase64(${inspect(base64, options)}, ${inspect(this.sub_type, options)})`;
	}
	/**
	* If this Binary represents a Int8 Vector (`binary.buffer[0] === Binary.VECTOR_TYPE.Int8`),
	* returns a copy of the bytes in a new Int8Array.
	*
	* If the Binary is not a Vector, or the datatype is not Int8, an error is thrown.
	*/
	toInt8Array() {
		if (this.sub_type !== Binary.SUBTYPE_VECTOR) throw new BSONError("Binary sub_type is not Vector");
		if (this.buffer[0] !== Binary.VECTOR_TYPE.Int8) throw new BSONError("Binary datatype field is not Int8");
		validateBinaryVector(this);
		return new Int8Array(this.buffer.buffer.slice(this.buffer.byteOffset + 2, this.buffer.byteOffset + this.position));
	}
	/**
	* If this Binary represents a Float32 Vector (`binary.buffer[0] === Binary.VECTOR_TYPE.Float32`),
	* returns a copy of the bytes in a new Float32Array.
	*
	* If the Binary is not a Vector, or the datatype is not Float32, an error is thrown.
	*/
	toFloat32Array() {
		if (this.sub_type !== Binary.SUBTYPE_VECTOR) throw new BSONError("Binary sub_type is not Vector");
		if (this.buffer[0] !== Binary.VECTOR_TYPE.Float32) throw new BSONError("Binary datatype field is not Float32");
		validateBinaryVector(this);
		const floatBytes = new Uint8Array(this.buffer.buffer.slice(this.buffer.byteOffset + 2, this.buffer.byteOffset + this.position));
		if (NumberUtils.isBigEndian) ByteUtils.swap32(floatBytes);
		return new Float32Array(floatBytes.buffer);
	}
	/**
	* If this Binary represents packed bit Vector (`binary.buffer[0] === Binary.VECTOR_TYPE.PackedBit`),
	* returns a copy of the bytes that are packed bits.
	*
	* Use `toBits` to get the unpacked bits.
	*
	* If the Binary is not a Vector, or the datatype is not PackedBit, an error is thrown.
	*/
	toPackedBits() {
		if (this.sub_type !== Binary.SUBTYPE_VECTOR) throw new BSONError("Binary sub_type is not Vector");
		if (this.buffer[0] !== Binary.VECTOR_TYPE.PackedBit) throw new BSONError("Binary datatype field is not packed bit");
		validateBinaryVector(this);
		return new Uint8Array(this.buffer.buffer.slice(this.buffer.byteOffset + 2, this.buffer.byteOffset + this.position));
	}
	/**
	* If this Binary represents a Packed bit Vector (`binary.buffer[0] === Binary.VECTOR_TYPE.PackedBit`),
	* returns a copy of the bit unpacked into a new Int8Array.
	*
	* Use `toPackedBits` to get the bits still in packed form.
	*
	* If the Binary is not a Vector, or the datatype is not PackedBit, an error is thrown.
	*/
	toBits() {
		if (this.sub_type !== Binary.SUBTYPE_VECTOR) throw new BSONError("Binary sub_type is not Vector");
		if (this.buffer[0] !== Binary.VECTOR_TYPE.PackedBit) throw new BSONError("Binary datatype field is not packed bit");
		validateBinaryVector(this);
		const bitCount = (this.length() - 2) * 8 - this.buffer[1];
		const bits = new Int8Array(bitCount);
		for (let bitOffset = 0; bitOffset < bits.length; bitOffset++) {
			const byteOffset = bitOffset / 8 | 0;
			bits[bitOffset] = this.buffer[byteOffset + 2] >> 7 - bitOffset % 8 & 1;
		}
		return bits;
	}
	/**
	* Constructs a Binary representing an Int8 Vector.
	* @param array - The array to store as a view on the Binary class
	*/
	static fromInt8Array(array) {
		const buffer = ByteUtils.allocate(array.byteLength + 2);
		buffer[0] = Binary.VECTOR_TYPE.Int8;
		buffer[1] = 0;
		const intBytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
		buffer.set(intBytes, 2);
		const bin = new this(buffer, this.SUBTYPE_VECTOR);
		validateBinaryVector(bin);
		return bin;
	}
	/** Constructs a Binary representing an Float32 Vector. */
	static fromFloat32Array(array) {
		const binaryBytes = ByteUtils.allocate(array.byteLength + 2);
		binaryBytes[0] = Binary.VECTOR_TYPE.Float32;
		binaryBytes[1] = 0;
		const floatBytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
		binaryBytes.set(floatBytes, 2);
		if (NumberUtils.isBigEndian) ByteUtils.swap32(new Uint8Array(binaryBytes.buffer, 2));
		const bin = new this(binaryBytes, this.SUBTYPE_VECTOR);
		validateBinaryVector(bin);
		return bin;
	}
	/**
	* Constructs a Binary representing a packed bit Vector.
	*
	* Use `fromBits` to pack an array of 1s and 0s.
	*/
	static fromPackedBits(array, padding = 0) {
		const buffer = ByteUtils.allocate(array.byteLength + 2);
		buffer[0] = Binary.VECTOR_TYPE.PackedBit;
		buffer[1] = padding;
		buffer.set(array, 2);
		const bin = new this(buffer, this.SUBTYPE_VECTOR);
		validateBinaryVector(bin);
		return bin;
	}
	/**
	* Constructs a Binary representing an Packed Bit Vector.
	* @param array - The array of 1s and 0s to pack into the Binary instance
	*/
	static fromBits(bits) {
		const byteLength = bits.length + 7 >>> 3;
		const bytes = new Uint8Array(byteLength + 2);
		bytes[0] = Binary.VECTOR_TYPE.PackedBit;
		const remainder = bits.length % 8;
		bytes[1] = remainder === 0 ? 0 : 8 - remainder;
		for (let bitOffset = 0; bitOffset < bits.length; bitOffset++) {
			const byteOffset = bitOffset >>> 3;
			const bit = bits[bitOffset];
			if (bit !== 0 && bit !== 1) throw new BSONError(`Invalid bit value at ${bitOffset}: must be 0 or 1, found ${bits[bitOffset]}`);
			if (bit === 0) continue;
			const shift = 7 - bitOffset % 8;
			bytes[byteOffset + 2] |= bit << shift;
		}
		return new this(bytes, Binary.SUBTYPE_VECTOR);
	}
};
function validateBinaryVector(vector) {
	if (vector.sub_type !== Binary.SUBTYPE_VECTOR) return;
	const size = vector.position;
	const datatype = vector.buffer[0];
	const padding = vector.buffer[1];
	if ((datatype === Binary.VECTOR_TYPE.Float32 || datatype === Binary.VECTOR_TYPE.Int8) && padding !== 0) throw new BSONError("Invalid Vector: padding must be zero for int8 and float32 vectors");
	if (datatype === Binary.VECTOR_TYPE.Float32) {
		if (size !== 0 && size - 2 !== 0 && (size - 2) % 4 !== 0) throw new BSONError("Invalid Vector: Float32 vector must contain a multiple of 4 bytes");
	}
	if (datatype === Binary.VECTOR_TYPE.PackedBit && padding !== 0 && size === 2) throw new BSONError("Invalid Vector: padding must be zero for packed bit vectors that are empty");
	if (datatype === Binary.VECTOR_TYPE.PackedBit && padding > 7) throw new BSONError(`Invalid Vector: padding must be a value between 0 and 7. found: ${padding}`);
}
const UUID_BYTE_LENGTH = 16;
const UUID_WITHOUT_DASHES = /^[0-9A-F]{32}$/i;
const UUID_WITH_DASHES = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
/**
* A class representation of the BSON UUID type.
* @public
*/
var UUID = class UUID extends Binary {
	/**
	* Create a UUID type
	*
	* When the argument to the constructor is omitted a random v4 UUID will be generated.
	*
	* @param input - Can be a 32 or 36 character hex string (dashes excluded/included) or a 16 byte binary Buffer.
	*/
	constructor(input) {
		let bytes;
		if (input == null) bytes = UUID.generate();
		else if (input instanceof UUID) bytes = ByteUtils.toLocalBufferType(new Uint8Array(input.buffer));
		else if (ArrayBuffer.isView(input) && input.byteLength === UUID_BYTE_LENGTH) bytes = ByteUtils.toLocalBufferType(input);
		else if (typeof input === "string") bytes = UUID.bytesFromString(input);
		else throw new BSONError("Argument passed in UUID constructor must be a UUID, a 16 byte Buffer or a 32/36 character hex string (dashes excluded/included, format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).");
		super(bytes, 4);
	}
	/**
	* The UUID bytes
	* @readonly
	*/
	get id() {
		return this.buffer;
	}
	set id(value) {
		this.buffer = value;
	}
	/**
	* Returns the UUID id as a 32 or 36 character hex string representation, excluding/including dashes (defaults to 36 character dash separated)
	* @param includeDashes - should the string exclude dash-separators.
	*/
	toHexString(includeDashes = true) {
		if (includeDashes) return [
			ByteUtils.toHex(this.buffer.subarray(0, 4)),
			ByteUtils.toHex(this.buffer.subarray(4, 6)),
			ByteUtils.toHex(this.buffer.subarray(6, 8)),
			ByteUtils.toHex(this.buffer.subarray(8, 10)),
			ByteUtils.toHex(this.buffer.subarray(10, 16))
		].join("-");
		return ByteUtils.toHex(this.buffer);
	}
	/**
	* Converts the id into a 36 character (dashes included) hex string, unless a encoding is specified.
	*/
	toString(encoding) {
		if (encoding === "hex") return ByteUtils.toHex(this.id);
		if (encoding === "base64") return ByteUtils.toBase64(this.id);
		return this.toHexString();
	}
	/**
	* Converts the id into its JSON string representation.
	* A 36 character (dashes included) hex string in the format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
	*/
	toJSON() {
		return this.toHexString();
	}
	/**
	* Compares the equality of this UUID with `otherID`.
	*
	* @param otherId - UUID instance to compare against.
	*/
	equals(otherId) {
		if (!otherId) return false;
		if (otherId instanceof UUID) return ByteUtils.equals(otherId.id, this.id);
		try {
			return ByteUtils.equals(new UUID(otherId).id, this.id);
		} catch {
			return false;
		}
	}
	/**
	* Creates a Binary instance from the current UUID.
	*/
	toBinary() {
		return new Binary(this.id, Binary.SUBTYPE_UUID);
	}
	/**
	* Generates a populated buffer containing a v4 uuid
	*/
	static generate() {
		const bytes = ByteUtils.randomBytes(UUID_BYTE_LENGTH);
		bytes[6] = bytes[6] & 15 | 64;
		bytes[8] = bytes[8] & 63 | 128;
		return bytes;
	}
	/**
	* Checks if a value is a valid bson UUID
	* @param input - UUID, string or Buffer to validate.
	*/
	static isValid(input) {
		if (!input) return false;
		if (typeof input === "string") return UUID.isValidUUIDString(input);
		if (isUint8Array(input)) return input.byteLength === UUID_BYTE_LENGTH;
		return input._bsontype === "Binary" && input.sub_type === this.SUBTYPE_UUID && input.buffer.byteLength === 16;
	}
	/**
	* Creates an UUID from a hex string representation of an UUID.
	* @param hexString - 32 or 36 character hex string (dashes excluded/included).
	*/
	static createFromHexString(hexString) {
		return new UUID(UUID.bytesFromString(hexString));
	}
	/** Creates an UUID from a base64 string representation of an UUID. */
	static createFromBase64(base64) {
		return new UUID(ByteUtils.fromBase64(base64));
	}
	/** @internal */
	static bytesFromString(representation) {
		if (!UUID.isValidUUIDString(representation)) throw new BSONError("UUID string representation must be 32 hex digits or canonical hyphenated representation");
		return ByteUtils.fromHex(representation.replace(/-/g, ""));
	}
	/**
	* @internal
	*
	* Validates a string to be a hex digit sequence with or without dashes.
	* The canonical hyphenated representation of a uuid is hex in 8-4-4-4-12 groups.
	*/
	static isValidUUIDString(representation) {
		return UUID_WITHOUT_DASHES.test(representation) || UUID_WITH_DASHES.test(representation);
	}
	/**
	* Converts to a string representation of this Id.
	*
	* @returns return the 36 character hex string representation.
	*
	*/
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		return `new UUID(${inspect(this.toHexString(), options)})`;
	}
};
//#endregion
//#region src/code.ts
/**
* A class representation of the BSON Code type.
* @public
* @category BSONType
*/
var Code = class Code extends BSONValue {
	get _bsontype() {
		return "Code";
	}
	code;
	scope;
	/**
	* @param code - a string or function.
	* @param scope - an optional scope for the function.
	*/
	constructor(code, scope) {
		super();
		this.code = code.toString();
		this.scope = scope ?? null;
	}
	toJSON() {
		if (this.scope != null) return {
			code: this.code,
			scope: this.scope
		};
		return { code: this.code };
	}
	/** @internal */
	toExtendedJSON() {
		if (this.scope) return {
			$code: this.code,
			$scope: this.scope
		};
		return { $code: this.code };
	}
	/** @internal */
	static fromExtendedJSON(doc) {
		return new Code(doc.$code, doc.$scope);
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		let parametersString = inspect(this.code, options);
		const multiLineFn = parametersString.includes("\n");
		if (this.scope != null) parametersString += `,${multiLineFn ? "\n" : " "}${inspect(this.scope, options)}`;
		const endingNewline = multiLineFn && this.scope === null;
		return `new Code(${multiLineFn ? "\n" : ""}${parametersString}${endingNewline ? "\n" : ""})`;
	}
};
//#endregion
//#region src/db_ref.ts
/** @internal */
function isDBRefLike(value) {
	return value != null && typeof value === "object" && "$id" in value && value.$id != null && "$ref" in value && typeof value.$ref === "string" && (!("$db" in value) || "$db" in value && typeof value.$db === "string");
}
/**
* A class representation of the BSON DBRef type.
* @public
* @category BSONType
*/
var DBRef = class DBRef extends BSONValue {
	get _bsontype() {
		return "DBRef";
	}
	collection;
	oid;
	db;
	fields;
	/**
	* @param collection - the collection name.
	* @param oid - the reference ObjectId.
	* @param db - optional db name, if omitted the reference is local to the current db.
	*/
	constructor(collection, oid, db, fields) {
		super();
		const parts = collection.split(".");
		if (parts.length === 2) {
			db = parts.shift();
			collection = parts.shift();
		}
		this.collection = collection;
		this.oid = oid;
		this.db = db;
		this.fields = fields || {};
	}
	/** @internal */
	get namespace() {
		return this.collection;
	}
	set namespace(value) {
		this.collection = value;
	}
	toJSON() {
		const o = Object.assign({
			$ref: this.collection,
			$id: this.oid
		}, this.fields);
		if (this.db != null) o.$db = this.db;
		return o;
	}
	/** @internal */
	toExtendedJSON(options) {
		options = options || {};
		let o = {
			$ref: this.collection,
			$id: this.oid
		};
		if (options.legacy) return o;
		if (this.db) o.$db = this.db;
		o = Object.assign(o, this.fields);
		return o;
	}
	/** @internal */
	static fromExtendedJSON(doc) {
		const copy = Object.assign({}, doc);
		delete copy.$ref;
		delete copy.$id;
		delete copy.$db;
		return new DBRef(doc.$ref, doc.$id, doc.$db, copy);
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		const args = [
			inspect(this.namespace, options),
			inspect(this.oid, options),
			...this.db ? [inspect(this.db, options)] : [],
			...Object.keys(this.fields).length > 0 ? [inspect(this.fields, options)] : []
		];
		args[1] = inspect === defaultInspect ? `new ObjectId(${args[1]})` : args[1];
		return `new DBRef(${args.join(", ")})`;
	}
};
//#endregion
//#region src/utils/string_utils.ts
/**
* @internal
* Removes leading zeros and explicit plus from textual representation of a number.
*/
function removeLeadingZerosAndExplicitPlus(str) {
	if (str === "") return str;
	let startIndex = 0;
	const isNegative = str[startIndex] === "-";
	const isExplicitlyPositive = str[startIndex] === "+";
	if (isExplicitlyPositive || isNegative) startIndex += 1;
	let foundInsignificantZero = false;
	for (; startIndex < str.length && str[startIndex] === "0"; ++startIndex) foundInsignificantZero = true;
	if (!foundInsignificantZero) return isExplicitlyPositive ? str.slice(1) : str;
	return `${isNegative ? "-" : ""}${str.length === startIndex ? "0" : str.slice(startIndex)}`;
}
/**
* @internal
* Returns false for an string that contains invalid characters for its radix, else returns the original string.
* @param str - The textual representation of the Long
* @param radix - The radix in which the text is written (2-36), defaults to 10
*/
function validateStringCharacters(str, radix) {
	radix = radix ?? 10;
	const validCharacters = "0123456789abcdefghijklmnopqrstuvwxyz".slice(0, radix);
	return new RegExp(`[^-+${validCharacters}]`, "i").test(str) ? false : str;
}
//#endregion
//#region src/long.ts
/**
* wasm optimizations, to do native i64 multiplication and divide
*/
let wasm = void 0;
try {
	wasm = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([
		0,
		97,
		115,
		109,
		1,
		0,
		0,
		0,
		1,
		13,
		2,
		96,
		0,
		1,
		127,
		96,
		4,
		127,
		127,
		127,
		127,
		1,
		127,
		3,
		7,
		6,
		0,
		1,
		1,
		1,
		1,
		1,
		6,
		6,
		1,
		127,
		1,
		65,
		0,
		11,
		7,
		50,
		6,
		3,
		109,
		117,
		108,
		0,
		1,
		5,
		100,
		105,
		118,
		95,
		115,
		0,
		2,
		5,
		100,
		105,
		118,
		95,
		117,
		0,
		3,
		5,
		114,
		101,
		109,
		95,
		115,
		0,
		4,
		5,
		114,
		101,
		109,
		95,
		117,
		0,
		5,
		8,
		103,
		101,
		116,
		95,
		104,
		105,
		103,
		104,
		0,
		0,
		10,
		191,
		1,
		6,
		4,
		0,
		35,
		0,
		11,
		36,
		1,
		1,
		126,
		32,
		0,
		173,
		32,
		1,
		173,
		66,
		32,
		134,
		132,
		32,
		2,
		173,
		32,
		3,
		173,
		66,
		32,
		134,
		132,
		126,
		34,
		4,
		66,
		32,
		135,
		167,
		36,
		0,
		32,
		4,
		167,
		11,
		36,
		1,
		1,
		126,
		32,
		0,
		173,
		32,
		1,
		173,
		66,
		32,
		134,
		132,
		32,
		2,
		173,
		32,
		3,
		173,
		66,
		32,
		134,
		132,
		127,
		34,
		4,
		66,
		32,
		135,
		167,
		36,
		0,
		32,
		4,
		167,
		11,
		36,
		1,
		1,
		126,
		32,
		0,
		173,
		32,
		1,
		173,
		66,
		32,
		134,
		132,
		32,
		2,
		173,
		32,
		3,
		173,
		66,
		32,
		134,
		132,
		128,
		34,
		4,
		66,
		32,
		135,
		167,
		36,
		0,
		32,
		4,
		167,
		11,
		36,
		1,
		1,
		126,
		32,
		0,
		173,
		32,
		1,
		173,
		66,
		32,
		134,
		132,
		32,
		2,
		173,
		32,
		3,
		173,
		66,
		32,
		134,
		132,
		129,
		34,
		4,
		66,
		32,
		135,
		167,
		36,
		0,
		32,
		4,
		167,
		11,
		36,
		1,
		1,
		126,
		32,
		0,
		173,
		32,
		1,
		173,
		66,
		32,
		134,
		132,
		32,
		2,
		173,
		32,
		3,
		173,
		66,
		32,
		134,
		132,
		130,
		34,
		4,
		66,
		32,
		135,
		167,
		36,
		0,
		32,
		4,
		167,
		11
	])), {}).exports;
} catch {}
const TWO_PWR_16_DBL = 65536;
const TWO_PWR_24_DBL = 1 << 24;
const TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;
const TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;
const TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;
/** A cache of the Long representations of small integer values. */
const INT_CACHE = {};
/** A cache of the Long representations of small unsigned integer values. */
const UINT_CACHE = {};
const MAX_INT64_STRING_LENGTH = 20;
const DECIMAL_REG_EX = /^(\+?0|(\+|-)?[1-9][0-9]*)$/;
/**
* A class representing a 64-bit integer
* @public
* @category BSONType
* @remarks
* The internal representation of a long is the two given signed, 32-bit values.
* We use 32-bit pieces because these are the size of integers on which
* Javascript performs bit-operations.  For operations like addition and
* multiplication, we split each number into 16 bit pieces, which can easily be
* multiplied within Javascript's floating-point representation without overflow
* or change in sign.
* In the algorithms below, we frequently reduce the negative case to the
* positive case by negating the input(s) and then post-processing the result.
* Note that we must ALWAYS check specially whether those values are MIN_VALUE
* (-2^63) because -MIN_VALUE == MIN_VALUE (since 2^63 cannot be represented as
* a positive number, it overflows back into a negative).  Not handling this
* case would often result in infinite recursion.
* Common constant values ZERO, ONE, NEG_ONE, etc. are found as static properties on this class.
*/
var Long = class Long extends BSONValue {
	get _bsontype() {
		return "Long";
	}
	/** An indicator used to reliably determine if an object is a Long or not. */
	get __isLong__() {
		return true;
	}
	/**
	* The high 32 bits as a signed value.
	*/
	high;
	/**
	* The low 32 bits as a signed value.
	*/
	low;
	/**
	* Whether unsigned or not.
	*/
	unsigned;
	constructor(lowOrValue = 0, highOrUnsigned, unsigned) {
		super();
		const unsignedBool = typeof highOrUnsigned === "boolean" ? highOrUnsigned : Boolean(unsigned);
		const high = typeof highOrUnsigned === "number" ? highOrUnsigned : 0;
		const res = typeof lowOrValue === "string" ? Long.fromString(lowOrValue, unsignedBool) : typeof lowOrValue === "bigint" ? Long.fromBigInt(lowOrValue, unsignedBool) : {
			low: lowOrValue | 0,
			high: high | 0,
			unsigned: unsignedBool
		};
		this.low = res.low;
		this.high = res.high;
		this.unsigned = res.unsigned;
	}
	static TWO_PWR_24 = Long.fromInt(TWO_PWR_24_DBL);
	/** Maximum unsigned value. */
	static MAX_UNSIGNED_VALUE = Long.fromBits(-1, -1, true);
	/** Signed zero */
	static ZERO = Long.fromInt(0);
	/** Unsigned zero. */
	static UZERO = Long.fromInt(0, true);
	/** Signed one. */
	static ONE = Long.fromInt(1);
	/** Unsigned one. */
	static UONE = Long.fromInt(1, true);
	/** Signed negative one. */
	static NEG_ONE = Long.fromInt(-1);
	/** Maximum signed value. */
	static MAX_VALUE = Long.fromBits(-1, 2147483647, false);
	/** Minimum signed value. */
	static MIN_VALUE = Long.fromBits(0, -2147483648, false);
	/**
	* Returns a Long representing the 64 bit integer that comes by concatenating the given low and high bits.
	* Each is assumed to use 32 bits.
	* @param lowBits - The low 32 bits
	* @param highBits - The high 32 bits
	* @param unsigned - Whether unsigned or not, defaults to signed
	* @returns The corresponding Long value
	*/
	static fromBits(lowBits, highBits, unsigned) {
		return new Long(lowBits, highBits, unsigned);
	}
	/**
	* Returns a Long representing the given 32 bit integer value.
	* @param value - The 32 bit integer in question
	* @param unsigned - Whether unsigned or not, defaults to signed
	* @returns The corresponding Long value
	*/
	static fromInt(value, unsigned) {
		let obj, cachedObj, cache;
		if (unsigned) {
			value >>>= 0;
			if (cache = 0 <= value && value < 256) {
				cachedObj = UINT_CACHE[value];
				if (cachedObj) return cachedObj;
			}
			obj = Long.fromBits(value, (value | 0) < 0 ? -1 : 0, true);
			if (cache) UINT_CACHE[value] = obj;
			return obj;
		} else {
			value |= 0;
			if (cache = -128 <= value && value < 128) {
				cachedObj = INT_CACHE[value];
				if (cachedObj) return cachedObj;
			}
			obj = Long.fromBits(value, value < 0 ? -1 : 0, false);
			if (cache) INT_CACHE[value] = obj;
			return obj;
		}
	}
	/**
	* Returns a Long representing the given value, provided that it is a finite number. Otherwise, zero is returned.
	* @param value - The number in question
	* @param unsigned - Whether unsigned or not, defaults to signed
	* @returns The corresponding Long value
	*/
	static fromNumber(value, unsigned) {
		if (isNaN(value)) return unsigned ? Long.UZERO : Long.ZERO;
		if (unsigned) {
			if (value < 0) return Long.UZERO;
			if (value >= TWO_PWR_64_DBL) return Long.MAX_UNSIGNED_VALUE;
		} else {
			if (value <= -TWO_PWR_63_DBL) return Long.MIN_VALUE;
			if (value + 1 >= TWO_PWR_63_DBL) return Long.MAX_VALUE;
		}
		if (value < 0) return Long.fromNumber(-value, unsigned).neg();
		return Long.fromBits(value % TWO_PWR_32_DBL | 0, value / TWO_PWR_32_DBL | 0, unsigned);
	}
	/**
	* Returns a Long representing the given value, provided that it is a finite number. Otherwise, zero is returned.
	* @param value - The number in question
	* @param unsigned - Whether unsigned or not, defaults to signed
	* @returns The corresponding Long value
	*/
	static fromBigInt(value, unsigned) {
		const FROM_BIGINT_BIT_MASK = 4294967295n;
		return new Long(Number(value & FROM_BIGINT_BIT_MASK), Number(value >> 32n & FROM_BIGINT_BIT_MASK), unsigned);
	}
	/**
	* @internal
	* Returns a Long representation of the given string, written using the specified radix.
	* Throws an error if `throwsError` is set to true and any of the following conditions are true:
	*  - the string contains invalid characters for the given radix
	*  - the string contains whitespace
	* @param str - The textual representation of the Long
	* @param unsigned - Whether unsigned or not, defaults to signed
	* @param radix - The radix in which the text is written (2-36), defaults to 10
	* @returns The corresponding Long value
	*/
	static _fromString(str, unsigned, radix) {
		if (str.length === 0) throw new BSONError("empty string");
		if (radix < 2 || 36 < radix) throw new BSONError("radix");
		let p;
		if ((p = str.indexOf("-")) > 0) throw new BSONError("interior hyphen");
		else if (p === 0) return Long._fromString(str.substring(1), unsigned, radix).neg();
		const radixToPower = Long.fromNumber(Math.pow(radix, 8));
		let result = Long.ZERO;
		for (let i = 0; i < str.length; i += 8) {
			const size = Math.min(8, str.length - i), value = parseInt(str.substring(i, i + size), radix);
			if (size < 8) {
				const power = Long.fromNumber(Math.pow(radix, size));
				result = result.mul(power).add(Long.fromNumber(value));
			} else {
				result = result.mul(radixToPower);
				result = result.add(Long.fromNumber(value));
			}
		}
		result.unsigned = unsigned;
		return result;
	}
	static fromStringStrict(str, unsignedOrRadix, radix) {
		let unsigned = false;
		if (typeof unsignedOrRadix === "number") radix = unsignedOrRadix, unsignedOrRadix = false;
		else unsigned = !!unsignedOrRadix;
		radix ??= 10;
		if (str.trim() !== str) throw new BSONError(`Input: '${str}' contains leading and/or trailing whitespace`);
		if (!validateStringCharacters(str, radix)) throw new BSONError(`Input: '${str}' contains invalid characters for radix: ${radix}`);
		const cleanedStr = removeLeadingZerosAndExplicitPlus(str);
		const result = Long._fromString(cleanedStr, unsigned, radix);
		if (result.toString(radix).toLowerCase() !== cleanedStr.toLowerCase()) throw new BSONError(`Input: ${str} is not representable as ${result.unsigned ? "an unsigned" : "a signed"} 64-bit Long ${radix != null ? `with radix: ${radix}` : ""}`);
		return result;
	}
	static fromString(str, unsignedOrRadix, radix) {
		let unsigned = false;
		if (typeof unsignedOrRadix === "number") radix = unsignedOrRadix, unsignedOrRadix = false;
		else unsigned = !!unsignedOrRadix;
		radix ??= 10;
		if (str === "NaN" && radix < 24) return Long.ZERO;
		else if ((str === "Infinity" || str === "+Infinity" || str === "-Infinity") && radix < 35) return Long.ZERO;
		return Long._fromString(str, unsigned, radix);
	}
	/**
	* Creates a Long from its byte representation.
	* @param bytes - Byte representation
	* @param unsigned - Whether unsigned or not, defaults to signed
	* @param le - Whether little or big endian, defaults to big endian
	* @returns The corresponding Long value
	*/
	static fromBytes(bytes, unsigned, le) {
		return le ? Long.fromBytesLE(bytes, unsigned) : Long.fromBytesBE(bytes, unsigned);
	}
	/**
	* Creates a Long from its little endian byte representation.
	* @param bytes - Little endian byte representation
	* @param unsigned - Whether unsigned or not, defaults to signed
	* @returns The corresponding Long value
	*/
	static fromBytesLE(bytes, unsigned) {
		return new Long(bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24, bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24, unsigned);
	}
	/**
	* Creates a Long from its big endian byte representation.
	* @param bytes - Big endian byte representation
	* @param unsigned - Whether unsigned or not, defaults to signed
	* @returns The corresponding Long value
	*/
	static fromBytesBE(bytes, unsigned) {
		return new Long(bytes[4] << 24 | bytes[5] << 16 | bytes[6] << 8 | bytes[7], bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3], unsigned);
	}
	/**
	* Tests if the specified object is a Long.
	*/
	static isLong(value) {
		return value != null && typeof value === "object" && "__isLong__" in value && value.__isLong__ === true;
	}
	/**
	* Converts the specified value to a Long.
	* @param unsigned - Whether unsigned or not, defaults to signed
	*/
	static fromValue(val, unsigned) {
		if (typeof val === "number") return Long.fromNumber(val, unsigned);
		if (typeof val === "string") return Long.fromString(val, unsigned);
		return Long.fromBits(val.low, val.high, typeof unsigned === "boolean" ? unsigned : val.unsigned);
	}
	/** Returns the sum of this and the specified Long. */
	add(addend) {
		if (!Long.isLong(addend)) addend = Long.fromValue(addend);
		const a48 = this.high >>> 16;
		const a32 = this.high & 65535;
		const a16 = this.low >>> 16;
		const a00 = this.low & 65535;
		const b48 = addend.high >>> 16;
		const b32 = addend.high & 65535;
		const b16 = addend.low >>> 16;
		const b00 = addend.low & 65535;
		let c48 = 0, c32 = 0, c16 = 0, c00 = 0;
		c00 += a00 + b00;
		c16 += c00 >>> 16;
		c00 &= 65535;
		c16 += a16 + b16;
		c32 += c16 >>> 16;
		c16 &= 65535;
		c32 += a32 + b32;
		c48 += c32 >>> 16;
		c32 &= 65535;
		c48 += a48 + b48;
		c48 &= 65535;
		return Long.fromBits(c16 << 16 | c00, c48 << 16 | c32, this.unsigned);
	}
	/**
	* Returns the sum of this and the specified Long.
	* @returns Sum
	*/
	and(other) {
		if (!Long.isLong(other)) other = Long.fromValue(other);
		return Long.fromBits(this.low & other.low, this.high & other.high, this.unsigned);
	}
	/**
	* Compares this Long's value with the specified's.
	* @returns 0 if they are the same, 1 if the this is greater and -1 if the given one is greater
	*/
	compare(other) {
		if (!Long.isLong(other)) other = Long.fromValue(other);
		if (this.eq(other)) return 0;
		const thisNeg = this.isNegative(), otherNeg = other.isNegative();
		if (thisNeg && !otherNeg) return -1;
		if (!thisNeg && otherNeg) return 1;
		if (!this.unsigned) return this.sub(other).isNegative() ? -1 : 1;
		return other.high >>> 0 > this.high >>> 0 || other.high === this.high && other.low >>> 0 > this.low >>> 0 ? -1 : 1;
	}
	/** This is an alias of {@link Long.compare} */
	comp(other) {
		return this.compare(other);
	}
	/**
	* Returns this Long divided by the specified. The result is signed if this Long is signed or unsigned if this Long is unsigned.
	* @returns Quotient
	*/
	divide(divisor) {
		if (!Long.isLong(divisor)) divisor = Long.fromValue(divisor);
		if (divisor.isZero()) throw new BSONError("division by zero");
		if (wasm) {
			if (!this.unsigned && this.high === -2147483648 && divisor.low === -1 && divisor.high === -1) return this;
			const low = (this.unsigned ? wasm.div_u : wasm.div_s)(this.low, this.high, divisor.low, divisor.high);
			return Long.fromBits(low, wasm.get_high(), this.unsigned);
		}
		if (this.isZero()) return this.unsigned ? Long.UZERO : Long.ZERO;
		let approx, rem, res;
		if (!this.unsigned) {
			if (this.eq(Long.MIN_VALUE)) if (divisor.eq(Long.ONE) || divisor.eq(Long.NEG_ONE)) return Long.MIN_VALUE;
			else if (divisor.eq(Long.MIN_VALUE)) return Long.ONE;
			else {
				approx = this.shr(1).div(divisor).shl(1);
				if (approx.eq(Long.ZERO)) return divisor.isNegative() ? Long.ONE : Long.NEG_ONE;
				else {
					rem = this.sub(divisor.mul(approx));
					res = approx.add(rem.div(divisor));
					return res;
				}
			}
			else if (divisor.eq(Long.MIN_VALUE)) return this.unsigned ? Long.UZERO : Long.ZERO;
			if (this.isNegative()) {
				if (divisor.isNegative()) return this.neg().div(divisor.neg());
				return this.neg().div(divisor).neg();
			} else if (divisor.isNegative()) return this.div(divisor.neg()).neg();
			res = Long.ZERO;
		} else {
			if (!divisor.unsigned) divisor = divisor.toUnsigned();
			if (divisor.gt(this)) return Long.UZERO;
			if (divisor.gt(this.shru(1))) return Long.UONE;
			res = Long.UZERO;
		}
		rem = this;
		while (rem.gte(divisor)) {
			approx = Math.max(1, Math.floor(rem.toNumber() / divisor.toNumber()));
			const log2 = Math.ceil(Math.log(approx) / Math.LN2);
			const delta = log2 <= 48 ? 1 : Math.pow(2, log2 - 48);
			let approxRes = Long.fromNumber(approx);
			let approxRem = approxRes.mul(divisor);
			while (approxRem.isNegative() || approxRem.gt(rem)) {
				approx -= delta;
				approxRes = Long.fromNumber(approx, this.unsigned);
				approxRem = approxRes.mul(divisor);
			}
			if (approxRes.isZero()) approxRes = Long.ONE;
			res = res.add(approxRes);
			rem = rem.sub(approxRem);
		}
		return res;
	}
	/**This is an alias of {@link Long.divide} */
	div(divisor) {
		return this.divide(divisor);
	}
	/**
	* Tests if this Long's value equals the specified's.
	* @param other - Other value
	*/
	equals(other) {
		if (!Long.isLong(other)) other = Long.fromValue(other);
		if (this.unsigned !== other.unsigned && this.high >>> 31 === 1 && other.high >>> 31 === 1) return false;
		return this.high === other.high && this.low === other.low;
	}
	/** This is an alias of {@link Long.equals} */
	eq(other) {
		return this.equals(other);
	}
	/** Gets the high 32 bits as a signed integer. */
	getHighBits() {
		return this.high;
	}
	/** Gets the high 32 bits as an unsigned integer. */
	getHighBitsUnsigned() {
		return this.high >>> 0;
	}
	/** Gets the low 32 bits as a signed integer. */
	getLowBits() {
		return this.low;
	}
	/** Gets the low 32 bits as an unsigned integer. */
	getLowBitsUnsigned() {
		return this.low >>> 0;
	}
	/** Gets the number of bits needed to represent the absolute value of this Long. */
	getNumBitsAbs() {
		if (this.isNegative()) return this.eq(Long.MIN_VALUE) ? 64 : this.neg().getNumBitsAbs();
		const val = this.high !== 0 ? this.high : this.low;
		let bit;
		for (bit = 31; bit > 0; bit--) if ((val & 1 << bit) !== 0) break;
		return this.high !== 0 ? bit + 33 : bit + 1;
	}
	/** Tests if this Long's value is greater than the specified's. */
	greaterThan(other) {
		return this.comp(other) > 0;
	}
	/** This is an alias of {@link Long.greaterThan} */
	gt(other) {
		return this.greaterThan(other);
	}
	/** Tests if this Long's value is greater than or equal the specified's. */
	greaterThanOrEqual(other) {
		return this.comp(other) >= 0;
	}
	/** This is an alias of {@link Long.greaterThanOrEqual} */
	gte(other) {
		return this.greaterThanOrEqual(other);
	}
	/** This is an alias of {@link Long.greaterThanOrEqual} */
	ge(other) {
		return this.greaterThanOrEqual(other);
	}
	/** Tests if this Long's value is even. */
	isEven() {
		return (this.low & 1) === 0;
	}
	/** Tests if this Long's value is negative. */
	isNegative() {
		return !this.unsigned && this.high < 0;
	}
	/** Tests if this Long's value is odd. */
	isOdd() {
		return (this.low & 1) === 1;
	}
	/** Tests if this Long's value is positive. */
	isPositive() {
		return this.unsigned || this.high >= 0;
	}
	/** Tests if this Long's value equals zero. */
	isZero() {
		return this.high === 0 && this.low === 0;
	}
	/** Tests if this Long's value is less than the specified's. */
	lessThan(other) {
		return this.comp(other) < 0;
	}
	/** This is an alias of {@link Long#lessThan}. */
	lt(other) {
		return this.lessThan(other);
	}
	/** Tests if this Long's value is less than or equal the specified's. */
	lessThanOrEqual(other) {
		return this.comp(other) <= 0;
	}
	/** This is an alias of {@link Long.lessThanOrEqual} */
	lte(other) {
		return this.lessThanOrEqual(other);
	}
	/** Returns this Long modulo the specified. */
	modulo(divisor) {
		if (!Long.isLong(divisor)) divisor = Long.fromValue(divisor);
		if (wasm) {
			const low = (this.unsigned ? wasm.rem_u : wasm.rem_s)(this.low, this.high, divisor.low, divisor.high);
			return Long.fromBits(low, wasm.get_high(), this.unsigned);
		}
		return this.sub(this.div(divisor).mul(divisor));
	}
	/** This is an alias of {@link Long.modulo} */
	mod(divisor) {
		return this.modulo(divisor);
	}
	/** This is an alias of {@link Long.modulo} */
	rem(divisor) {
		return this.modulo(divisor);
	}
	/**
	* Returns the product of this and the specified Long.
	* @param multiplier - Multiplier
	* @returns Product
	*/
	multiply(multiplier) {
		if (this.isZero()) return Long.ZERO;
		if (!Long.isLong(multiplier)) multiplier = Long.fromValue(multiplier);
		if (wasm) {
			const low = wasm.mul(this.low, this.high, multiplier.low, multiplier.high);
			return Long.fromBits(low, wasm.get_high(), this.unsigned);
		}
		if (multiplier.isZero()) return Long.ZERO;
		if (this.eq(Long.MIN_VALUE)) return multiplier.isOdd() ? Long.MIN_VALUE : Long.ZERO;
		if (multiplier.eq(Long.MIN_VALUE)) return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
		if (this.isNegative()) if (multiplier.isNegative()) return this.neg().mul(multiplier.neg());
		else return this.neg().mul(multiplier).neg();
		else if (multiplier.isNegative()) return this.mul(multiplier.neg()).neg();
		if (this.lt(Long.TWO_PWR_24) && multiplier.lt(Long.TWO_PWR_24)) return Long.fromNumber(this.toNumber() * multiplier.toNumber(), this.unsigned);
		const a48 = this.high >>> 16;
		const a32 = this.high & 65535;
		const a16 = this.low >>> 16;
		const a00 = this.low & 65535;
		const b48 = multiplier.high >>> 16;
		const b32 = multiplier.high & 65535;
		const b16 = multiplier.low >>> 16;
		const b00 = multiplier.low & 65535;
		let c48 = 0, c32 = 0, c16 = 0, c00 = 0;
		c00 += a00 * b00;
		c16 += c00 >>> 16;
		c00 &= 65535;
		c16 += a16 * b00;
		c32 += c16 >>> 16;
		c16 &= 65535;
		c16 += a00 * b16;
		c32 += c16 >>> 16;
		c16 &= 65535;
		c32 += a32 * b00;
		c48 += c32 >>> 16;
		c32 &= 65535;
		c32 += a16 * b16;
		c48 += c32 >>> 16;
		c32 &= 65535;
		c32 += a00 * b32;
		c48 += c32 >>> 16;
		c32 &= 65535;
		c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
		c48 &= 65535;
		return Long.fromBits(c16 << 16 | c00, c48 << 16 | c32, this.unsigned);
	}
	/** This is an alias of {@link Long.multiply} */
	mul(multiplier) {
		return this.multiply(multiplier);
	}
	/** Returns the Negation of this Long's value. */
	negate() {
		if (!this.unsigned && this.eq(Long.MIN_VALUE)) return Long.MIN_VALUE;
		return this.not().add(Long.ONE);
	}
	/** This is an alias of {@link Long.negate} */
	neg() {
		return this.negate();
	}
	/** Returns the bitwise NOT of this Long. */
	not() {
		return Long.fromBits(~this.low, ~this.high, this.unsigned);
	}
	/** Tests if this Long's value differs from the specified's. */
	notEquals(other) {
		return !this.equals(other);
	}
	/** This is an alias of {@link Long.notEquals} */
	neq(other) {
		return this.notEquals(other);
	}
	/** This is an alias of {@link Long.notEquals} */
	ne(other) {
		return this.notEquals(other);
	}
	/**
	* Returns the bitwise OR of this Long and the specified.
	*/
	or(other) {
		if (!Long.isLong(other)) other = Long.fromValue(other);
		return Long.fromBits(this.low | other.low, this.high | other.high, this.unsigned);
	}
	/**
	* Returns this Long with bits shifted to the left by the given amount.
	* @param numBits - Number of bits
	* @returns Shifted Long
	*/
	shiftLeft(numBits) {
		if (Long.isLong(numBits)) numBits = numBits.toInt();
		if ((numBits &= 63) === 0) return this;
		else if (numBits < 32) return Long.fromBits(this.low << numBits, this.high << numBits | this.low >>> 32 - numBits, this.unsigned);
		else return Long.fromBits(0, this.low << numBits - 32, this.unsigned);
	}
	/** This is an alias of {@link Long.shiftLeft} */
	shl(numBits) {
		return this.shiftLeft(numBits);
	}
	/**
	* Returns this Long with bits arithmetically shifted to the right by the given amount.
	* @param numBits - Number of bits
	* @returns Shifted Long
	*/
	shiftRight(numBits) {
		if (Long.isLong(numBits)) numBits = numBits.toInt();
		if ((numBits &= 63) === 0) return this;
		else if (numBits < 32) return Long.fromBits(this.low >>> numBits | this.high << 32 - numBits, this.high >> numBits, this.unsigned);
		else return Long.fromBits(this.high >> numBits - 32, this.high >= 0 ? 0 : -1, this.unsigned);
	}
	/** This is an alias of {@link Long.shiftRight} */
	shr(numBits) {
		return this.shiftRight(numBits);
	}
	/**
	* Returns this Long with bits logically shifted to the right by the given amount.
	* @param numBits - Number of bits
	* @returns Shifted Long
	*/
	shiftRightUnsigned(numBits) {
		if (Long.isLong(numBits)) numBits = numBits.toInt();
		numBits &= 63;
		if (numBits === 0) return this;
		else {
			const high = this.high;
			if (numBits < 32) {
				const low = this.low;
				return Long.fromBits(low >>> numBits | high << 32 - numBits, high >>> numBits, this.unsigned);
			} else if (numBits === 32) return Long.fromBits(high, 0, this.unsigned);
			else return Long.fromBits(high >>> numBits - 32, 0, this.unsigned);
		}
	}
	/** This is an alias of {@link Long.shiftRightUnsigned} */
	shr_u(numBits) {
		return this.shiftRightUnsigned(numBits);
	}
	/** This is an alias of {@link Long.shiftRightUnsigned} */
	shru(numBits) {
		return this.shiftRightUnsigned(numBits);
	}
	/**
	* Returns the difference of this and the specified Long.
	* @param subtrahend - Subtrahend
	* @returns Difference
	*/
	subtract(subtrahend) {
		if (!Long.isLong(subtrahend)) subtrahend = Long.fromValue(subtrahend);
		return this.add(subtrahend.neg());
	}
	/** This is an alias of {@link Long.subtract} */
	sub(subtrahend) {
		return this.subtract(subtrahend);
	}
	/** Converts the Long to a 32 bit integer, assuming it is a 32 bit integer. */
	toInt() {
		return this.unsigned ? this.low >>> 0 : this.low;
	}
	/** Converts the Long to a the nearest floating-point representation of this value (double, 53 bit mantissa). */
	toNumber() {
		if (this.unsigned) return (this.high >>> 0) * TWO_PWR_32_DBL + (this.low >>> 0);
		return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
	}
	/** Converts the Long to a BigInt (arbitrary precision). */
	toBigInt() {
		return BigInt(this.toString());
	}
	/**
	* Converts this Long to its byte representation.
	* @param le - Whether little or big endian, defaults to big endian
	* @returns Byte representation
	*/
	toBytes(le) {
		return le ? this.toBytesLE() : this.toBytesBE();
	}
	/**
	* Converts this Long to its little endian byte representation.
	* @returns Little endian byte representation
	*/
	toBytesLE() {
		const hi = this.high, lo = this.low;
		return [
			lo & 255,
			lo >>> 8 & 255,
			lo >>> 16 & 255,
			lo >>> 24,
			hi & 255,
			hi >>> 8 & 255,
			hi >>> 16 & 255,
			hi >>> 24
		];
	}
	/**
	* Converts this Long to its big endian byte representation.
	* @returns Big endian byte representation
	*/
	toBytesBE() {
		const hi = this.high, lo = this.low;
		return [
			hi >>> 24,
			hi >>> 16 & 255,
			hi >>> 8 & 255,
			hi & 255,
			lo >>> 24,
			lo >>> 16 & 255,
			lo >>> 8 & 255,
			lo & 255
		];
	}
	/**
	* Converts this Long to signed.
	*/
	toSigned() {
		if (!this.unsigned) return this;
		return Long.fromBits(this.low, this.high, false);
	}
	/**
	* Converts the Long to a string written in the specified radix.
	* @param radix - Radix (2-36), defaults to 10
	* @throws RangeError If `radix` is out of range
	*/
	toString(radix) {
		radix = radix || 10;
		if (radix < 2 || 36 < radix) throw new BSONError("radix");
		if (this.isZero()) return "0";
		if (this.isNegative()) if (this.eq(Long.MIN_VALUE)) {
			const radixLong = Long.fromNumber(radix), div = this.div(radixLong), rem1 = div.mul(radixLong).sub(this);
			return div.toString(radix) + rem1.toInt().toString(radix);
		} else return "-" + this.neg().toString(radix);
		const radixToPower = Long.fromNumber(Math.pow(radix, 6), this.unsigned);
		let rem = this;
		let result = "";
		while (true) {
			const remDiv = rem.div(radixToPower);
			let digits = (rem.sub(remDiv.mul(radixToPower)).toInt() >>> 0).toString(radix);
			rem = remDiv;
			if (rem.isZero()) return digits + result;
			else {
				while (digits.length < 6) digits = "0" + digits;
				result = "" + digits + result;
			}
		}
	}
	/** Converts this Long to unsigned. */
	toUnsigned() {
		if (this.unsigned) return this;
		return Long.fromBits(this.low, this.high, true);
	}
	/** Returns the bitwise XOR of this Long and the given one. */
	xor(other) {
		if (!Long.isLong(other)) other = Long.fromValue(other);
		return Long.fromBits(this.low ^ other.low, this.high ^ other.high, this.unsigned);
	}
	/** This is an alias of {@link Long.isZero} */
	eqz() {
		return this.isZero();
	}
	/** This is an alias of {@link Long.lessThanOrEqual} */
	le(other) {
		return this.lessThanOrEqual(other);
	}
	toExtendedJSON(options) {
		if (options && options.relaxed) return this.toNumber();
		return { $numberLong: this.toString() };
	}
	static fromExtendedJSON(doc, options) {
		const { useBigInt64 = false, relaxed = true } = { ...options };
		if (doc.$numberLong.length > MAX_INT64_STRING_LENGTH) throw new BSONError("$numberLong string is too long");
		if (!DECIMAL_REG_EX.test(doc.$numberLong)) throw new BSONError(`$numberLong string "${doc.$numberLong}" is in an invalid format`);
		if (useBigInt64) {
			const bigIntResult = BigInt(doc.$numberLong);
			return BigInt.asIntN(64, bigIntResult);
		}
		const longResult = Long.fromString(doc.$numberLong);
		if (relaxed) return longResult.toNumber();
		return longResult;
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		return `new Long(${inspect(this.toString(), options)}${this.unsigned ? `, ${inspect(this.unsigned, options)}` : ""})`;
	}
};
//#endregion
//#region src/decimal128.ts
const PARSE_STRING_REGEXP = /^(\+|-)?(\d+|(\d*\.\d*))?(E|e)?([-+])?(\d+)?$/;
const PARSE_INF_REGEXP = /^(\+|-)?(Infinity|inf)$/i;
const PARSE_NAN_REGEXP = /^(\+|-)?NaN$/i;
const EXPONENT_MAX = 6111;
const EXPONENT_MIN = -6176;
const EXPONENT_BIAS = 6176;
const MAX_DIGITS = 34;
const NAN_BUFFER = ByteUtils.fromNumberArray([
	124,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0
].reverse());
const INF_NEGATIVE_BUFFER = ByteUtils.fromNumberArray([
	248,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0
].reverse());
const INF_POSITIVE_BUFFER = ByteUtils.fromNumberArray([
	120,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0
].reverse());
const EXPONENT_REGEX = /^([-+])?(\d+)?$/;
const COMBINATION_MASK = 31;
const EXPONENT_MASK = 16383;
const COMBINATION_INFINITY = 30;
const COMBINATION_NAN = 31;
function isDigit(value) {
	return !isNaN(parseInt(value, 10));
}
function divideu128(value) {
	const DIVISOR = Long.fromNumber(1e3 * 1e3 * 1e3);
	let _rem = Long.fromNumber(0);
	if (!value.parts[0] && !value.parts[1] && !value.parts[2] && !value.parts[3]) return {
		quotient: value,
		rem: _rem
	};
	for (let i = 0; i <= 3; i++) {
		_rem = _rem.shiftLeft(32);
		_rem = _rem.add(new Long(value.parts[i], 0));
		value.parts[i] = _rem.div(DIVISOR).low;
		_rem = _rem.modulo(DIVISOR);
	}
	return {
		quotient: value,
		rem: _rem
	};
}
function multiply64x2(left, right) {
	if (!left && !right) return {
		high: Long.fromNumber(0),
		low: Long.fromNumber(0)
	};
	const leftHigh = left.shiftRightUnsigned(32);
	const leftLow = new Long(left.getLowBits(), 0);
	const rightHigh = right.shiftRightUnsigned(32);
	const rightLow = new Long(right.getLowBits(), 0);
	let productHigh = leftHigh.multiply(rightHigh);
	let productMid = leftHigh.multiply(rightLow);
	const productMid2 = leftLow.multiply(rightHigh);
	let productLow = leftLow.multiply(rightLow);
	productHigh = productHigh.add(productMid.shiftRightUnsigned(32));
	productMid = new Long(productMid.getLowBits(), 0).add(productMid2).add(productLow.shiftRightUnsigned(32));
	productHigh = productHigh.add(productMid.shiftRightUnsigned(32));
	productLow = productMid.shiftLeft(32).add(new Long(productLow.getLowBits(), 0));
	return {
		high: productHigh,
		low: productLow
	};
}
function lessThan(left, right) {
	const uhleft = left.high >>> 0;
	const uhright = right.high >>> 0;
	if (uhleft < uhright) return true;
	else if (uhleft === uhright) {
		if (left.low >>> 0 < right.low >>> 0) return true;
	}
	return false;
}
function invalidErr(string, message) {
	throw new BSONError(`"${string}" is not a valid Decimal128 string - ${message}`);
}
/**
* A class representation of the BSON Decimal128 type.
* @public
* @category BSONType
*/
var Decimal128 = class Decimal128 extends BSONValue {
	get _bsontype() {
		return "Decimal128";
	}
	bytes;
	/**
	* @param bytes - a buffer containing the raw Decimal128 bytes in little endian order,
	*                or a string representation as returned by .toString()
	*/
	constructor(bytes) {
		super();
		if (typeof bytes === "string") this.bytes = Decimal128.fromString(bytes).bytes;
		else if (bytes instanceof Uint8Array || isUint8Array(bytes)) {
			if (bytes.byteLength !== 16) throw new BSONError("Decimal128 must take a Buffer of 16 bytes");
			this.bytes = bytes;
		} else throw new BSONError("Decimal128 must take a Buffer or string");
	}
	/**
	* Create a Decimal128 instance from a string representation
	*
	* @param representation - a numeric string representation.
	*/
	static fromString(representation) {
		return Decimal128._fromString(representation, { allowRounding: false });
	}
	/**
	* Create a Decimal128 instance from a string representation, allowing for rounding to 34
	* significant digits
	*
	* @example Example of a number that will be rounded
	* ```ts
	* > let d = Decimal128.fromString('37.499999999999999196428571428571375')
	* Uncaught:
	* BSONError: "37.499999999999999196428571428571375" is not a valid Decimal128 string - inexact rounding
	* at invalidErr (/home/wajames/js-bson/lib/bson.cjs:1402:11)
	* at Decimal128.fromStringInternal (/home/wajames/js-bson/lib/bson.cjs:1633:25)
	* at Decimal128.fromString (/home/wajames/js-bson/lib/bson.cjs:1424:27)
	*
	* > d = Decimal128.fromStringWithRounding('37.499999999999999196428571428571375')
	* new Decimal128("37.49999999999999919642857142857138")
	* ```
	* @param representation - a numeric string representation.
	*/
	static fromStringWithRounding(representation) {
		return Decimal128._fromString(representation, { allowRounding: true });
	}
	static _fromString(representation, options) {
		let isNegative = false;
		let sawSign = false;
		let sawRadix = false;
		let foundNonZero = false;
		let significantDigits = 0;
		let nDigitsRead = 0;
		let nDigits = 0;
		let radixPosition = 0;
		let firstNonZero = 0;
		const digits = [0];
		let nDigitsStored = 0;
		let digitsInsert = 0;
		let lastDigit = 0;
		let exponent = 0;
		let significandHigh = new Long(0, 0);
		let significandLow = new Long(0, 0);
		let biasedExponent = 0;
		let index = 0;
		if (representation.length >= 7e3) throw new BSONError("" + representation + " not a valid Decimal128 string");
		const stringMatch = representation.match(PARSE_STRING_REGEXP);
		const infMatch = representation.match(PARSE_INF_REGEXP);
		const nanMatch = representation.match(PARSE_NAN_REGEXP);
		if (!stringMatch && !infMatch && !nanMatch || representation.length === 0) throw new BSONError("" + representation + " not a valid Decimal128 string");
		if (stringMatch) {
			const unsignedNumber = stringMatch[2];
			const e = stringMatch[4];
			const expSign = stringMatch[5];
			const expNumber = stringMatch[6];
			if (e && expNumber === void 0) invalidErr(representation, "missing exponent power");
			if (e && unsignedNumber === void 0) invalidErr(representation, "missing exponent base");
			if (e === void 0 && (expSign || expNumber)) invalidErr(representation, "missing e before exponent");
		}
		if (representation[index] === "+" || representation[index] === "-") {
			sawSign = true;
			isNegative = representation[index++] === "-";
		}
		if (!isDigit(representation[index]) && representation[index] !== ".") {
			if (representation[index] === "i" || representation[index] === "I") return new Decimal128(isNegative ? INF_NEGATIVE_BUFFER : INF_POSITIVE_BUFFER);
			else if (representation[index] === "N") return new Decimal128(NAN_BUFFER);
		}
		while (isDigit(representation[index]) || representation[index] === ".") {
			if (representation[index] === ".") {
				if (sawRadix) invalidErr(representation, "contains multiple periods");
				sawRadix = true;
				index = index + 1;
				continue;
			}
			if (nDigitsStored < MAX_DIGITS) {
				if (representation[index] !== "0" || foundNonZero) {
					if (!foundNonZero) firstNonZero = nDigitsRead;
					foundNonZero = true;
					digits[digitsInsert++] = parseInt(representation[index], 10);
					nDigitsStored = nDigitsStored + 1;
				}
			}
			if (foundNonZero) nDigits = nDigits + 1;
			if (sawRadix) radixPosition = radixPosition + 1;
			nDigitsRead = nDigitsRead + 1;
			index = index + 1;
		}
		if (sawRadix && !nDigitsRead) throw new BSONError("" + representation + " not a valid Decimal128 string");
		if (representation[index] === "e" || representation[index] === "E") {
			const match = representation.substr(++index).match(EXPONENT_REGEX);
			if (!match || !match[2]) return new Decimal128(NAN_BUFFER);
			exponent = parseInt(match[0], 10);
			index = index + match[0].length;
		}
		if (representation[index]) return new Decimal128(NAN_BUFFER);
		if (!nDigitsStored) {
			digits[0] = 0;
			nDigits = 1;
			nDigitsStored = 1;
			significantDigits = 0;
		} else {
			lastDigit = nDigitsStored - 1;
			significantDigits = nDigits;
			if (significantDigits !== 1) while (representation[firstNonZero + significantDigits - 1 + Number(sawSign) + Number(sawRadix)] === "0") significantDigits = significantDigits - 1;
		}
		if (exponent <= radixPosition && radixPosition > exponent + 16384) exponent = EXPONENT_MIN;
		else exponent = exponent - radixPosition;
		while (exponent > EXPONENT_MAX) {
			lastDigit = lastDigit + 1;
			if (lastDigit >= MAX_DIGITS) {
				if (significantDigits === 0) {
					exponent = EXPONENT_MAX;
					break;
				}
				invalidErr(representation, "overflow");
			}
			exponent = exponent - 1;
		}
		if (options.allowRounding) {
			while (exponent < EXPONENT_MIN || nDigitsStored < nDigits) {
				if (lastDigit === 0 && significantDigits < nDigitsStored) {
					exponent = EXPONENT_MIN;
					significantDigits = 0;
					break;
				}
				if (nDigitsStored < nDigits) nDigits = nDigits - 1;
				else lastDigit = lastDigit - 1;
				if (exponent < EXPONENT_MAX) exponent = exponent + 1;
				else {
					if (digits.join("").match(/^0+$/)) {
						exponent = EXPONENT_MAX;
						break;
					}
					invalidErr(representation, "overflow");
				}
			}
			if (lastDigit + 1 < significantDigits) {
				let endOfString = nDigitsRead;
				if (sawRadix) {
					firstNonZero = firstNonZero + 1;
					endOfString = endOfString + 1;
				}
				if (sawSign) {
					firstNonZero = firstNonZero + 1;
					endOfString = endOfString + 1;
				}
				const roundDigit = parseInt(representation[firstNonZero + lastDigit + 1], 10);
				let roundBit = 0;
				if (roundDigit >= 5) {
					roundBit = 1;
					if (roundDigit === 5) {
						roundBit = digits[lastDigit] % 2 === 1 ? 1 : 0;
						for (let i = firstNonZero + lastDigit + 2; i < endOfString; i++) if (parseInt(representation[i], 10)) {
							roundBit = 1;
							break;
						}
					}
				}
				if (roundBit) {
					let dIdx = lastDigit;
					for (; dIdx >= 0; dIdx--) if (++digits[dIdx] > 9) {
						digits[dIdx] = 0;
						if (dIdx === 0) if (exponent < EXPONENT_MAX) {
							exponent = exponent + 1;
							digits[dIdx] = 1;
						} else return new Decimal128(isNegative ? INF_NEGATIVE_BUFFER : INF_POSITIVE_BUFFER);
					} else break;
				}
			}
		} else {
			while (exponent < EXPONENT_MIN || nDigitsStored < nDigits) {
				if (lastDigit === 0) {
					if (significantDigits === 0) {
						exponent = EXPONENT_MIN;
						break;
					}
					invalidErr(representation, "exponent underflow");
				}
				if (nDigitsStored < nDigits) {
					if (representation[nDigits - 1 + Number(sawSign) + Number(sawRadix)] !== "0" && significantDigits !== 0) invalidErr(representation, "inexact rounding");
					nDigits = nDigits - 1;
				} else {
					if (digits[lastDigit] !== 0) invalidErr(representation, "inexact rounding");
					lastDigit = lastDigit - 1;
				}
				if (exponent < EXPONENT_MAX) exponent = exponent + 1;
				else invalidErr(representation, "overflow");
			}
			if (lastDigit + 1 < significantDigits) {
				if (sawRadix) firstNonZero = firstNonZero + 1;
				if (sawSign) firstNonZero = firstNonZero + 1;
				if (parseInt(representation[firstNonZero + lastDigit + 1], 10) !== 0) invalidErr(representation, "inexact rounding");
			}
		}
		significandHigh = Long.fromNumber(0);
		significandLow = Long.fromNumber(0);
		if (significantDigits === 0) {
			significandHigh = Long.fromNumber(0);
			significandLow = Long.fromNumber(0);
		} else if (lastDigit < 17) {
			let dIdx = 0;
			significandLow = Long.fromNumber(digits[dIdx++]);
			significandHigh = new Long(0, 0);
			for (; dIdx <= lastDigit; dIdx++) {
				significandLow = significandLow.multiply(Long.fromNumber(10));
				significandLow = significandLow.add(Long.fromNumber(digits[dIdx]));
			}
		} else {
			let dIdx = 0;
			significandHigh = Long.fromNumber(digits[dIdx++]);
			for (; dIdx <= lastDigit - 17; dIdx++) {
				significandHigh = significandHigh.multiply(Long.fromNumber(10));
				significandHigh = significandHigh.add(Long.fromNumber(digits[dIdx]));
			}
			significandLow = Long.fromNumber(digits[dIdx++]);
			for (; dIdx <= lastDigit; dIdx++) {
				significandLow = significandLow.multiply(Long.fromNumber(10));
				significandLow = significandLow.add(Long.fromNumber(digits[dIdx]));
			}
		}
		const significand = multiply64x2(significandHigh, Long.fromString("100000000000000000"));
		significand.low = significand.low.add(significandLow);
		if (lessThan(significand.low, significandLow)) significand.high = significand.high.add(Long.fromNumber(1));
		biasedExponent = exponent + EXPONENT_BIAS;
		const dec = {
			low: Long.fromNumber(0),
			high: Long.fromNumber(0)
		};
		if (significand.high.shiftRightUnsigned(49).and(Long.fromNumber(1)).equals(Long.fromNumber(1))) {
			dec.high = dec.high.or(Long.fromNumber(3).shiftLeft(61));
			dec.high = dec.high.or(Long.fromNumber(biasedExponent).and(Long.fromNumber(16383).shiftLeft(47)));
			dec.high = dec.high.or(significand.high.and(Long.fromNumber(0x7fffffffffff)));
		} else {
			dec.high = dec.high.or(Long.fromNumber(biasedExponent & 16383).shiftLeft(49));
			dec.high = dec.high.or(significand.high.and(Long.fromNumber(562949953421311)));
		}
		dec.low = significand.low;
		if (isNegative) dec.high = dec.high.or(Long.fromString("9223372036854775808"));
		const buffer = ByteUtils.allocateUnsafe(16);
		index = 0;
		buffer[index++] = dec.low.low & 255;
		buffer[index++] = dec.low.low >> 8 & 255;
		buffer[index++] = dec.low.low >> 16 & 255;
		buffer[index++] = dec.low.low >> 24 & 255;
		buffer[index++] = dec.low.high & 255;
		buffer[index++] = dec.low.high >> 8 & 255;
		buffer[index++] = dec.low.high >> 16 & 255;
		buffer[index++] = dec.low.high >> 24 & 255;
		buffer[index++] = dec.high.low & 255;
		buffer[index++] = dec.high.low >> 8 & 255;
		buffer[index++] = dec.high.low >> 16 & 255;
		buffer[index++] = dec.high.low >> 24 & 255;
		buffer[index++] = dec.high.high & 255;
		buffer[index++] = dec.high.high >> 8 & 255;
		buffer[index++] = dec.high.high >> 16 & 255;
		buffer[index++] = dec.high.high >> 24 & 255;
		return new Decimal128(buffer);
	}
	/** Create a string representation of the raw Decimal128 value */
	toString() {
		let biased_exponent;
		let significand_digits = 0;
		const significand = new Array(36);
		for (let i = 0; i < significand.length; i++) significand[i] = 0;
		let index = 0;
		let is_zero = false;
		let significand_msb;
		let significand128 = { parts: [
			0,
			0,
			0,
			0
		] };
		let j, k;
		const string = [];
		index = 0;
		const buffer = this.bytes;
		const low = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
		const midl = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
		const midh = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
		const high = buffer[index++] | buffer[index++] << 8 | buffer[index++] << 16 | buffer[index++] << 24;
		index = 0;
		if ({
			low: new Long(low, midl),
			high: new Long(midh, high)
		}.high.lessThan(Long.ZERO)) string.push("-");
		const combination = high >> 26 & COMBINATION_MASK;
		if (combination >> 3 === 3) if (combination === COMBINATION_INFINITY) return string.join("") + "Infinity";
		else if (combination === COMBINATION_NAN) return "NaN";
		else {
			biased_exponent = high >> 15 & EXPONENT_MASK;
			significand_msb = 8 + (high >> 14 & 1);
		}
		else {
			significand_msb = high >> 14 & 7;
			biased_exponent = high >> 17 & EXPONENT_MASK;
		}
		const exponent = biased_exponent - EXPONENT_BIAS;
		significand128.parts[0] = (high & 16383) + ((significand_msb & 15) << 14);
		significand128.parts[1] = midh;
		significand128.parts[2] = midl;
		significand128.parts[3] = low;
		if (significand128.parts[0] === 0 && significand128.parts[1] === 0 && significand128.parts[2] === 0 && significand128.parts[3] === 0) is_zero = true;
		else for (k = 3; k >= 0; k--) {
			let least_digits = 0;
			const result = divideu128(significand128);
			significand128 = result.quotient;
			least_digits = result.rem.low;
			if (!least_digits) continue;
			for (j = 8; j >= 0; j--) {
				significand[k * 9 + j] = least_digits % 10;
				least_digits = Math.floor(least_digits / 10);
			}
		}
		if (is_zero) {
			significand_digits = 1;
			significand[index] = 0;
		} else {
			significand_digits = 36;
			while (!significand[index]) {
				significand_digits = significand_digits - 1;
				index = index + 1;
			}
		}
		const scientific_exponent = significand_digits - 1 + exponent;
		if (scientific_exponent >= 34 || scientific_exponent <= -7 || exponent > 0) {
			if (significand_digits > 34) {
				string.push(`0`);
				if (exponent > 0) string.push(`E+${exponent}`);
				else if (exponent < 0) string.push(`E${exponent}`);
				return string.join("");
			}
			string.push(`${significand[index++]}`);
			significand_digits = significand_digits - 1;
			if (significand_digits) string.push(".");
			for (let i = 0; i < significand_digits; i++) string.push(`${significand[index++]}`);
			string.push("E");
			if (scientific_exponent > 0) string.push(`+${scientific_exponent}`);
			else string.push(`${scientific_exponent}`);
		} else if (exponent >= 0) for (let i = 0; i < significand_digits; i++) string.push(`${significand[index++]}`);
		else {
			let radix_position = significand_digits + exponent;
			if (radix_position > 0) for (let i = 0; i < radix_position; i++) string.push(`${significand[index++]}`);
			else string.push("0");
			string.push(".");
			while (radix_position++ < 0) string.push("0");
			for (let i = 0; i < significand_digits - Math.max(radix_position - 1, 0); i++) string.push(`${significand[index++]}`);
		}
		return string.join("");
	}
	toJSON() {
		return { $numberDecimal: this.toString() };
	}
	/** @internal */
	toExtendedJSON() {
		return { $numberDecimal: this.toString() };
	}
	/** @internal */
	static fromExtendedJSON(doc) {
		return Decimal128.fromString(doc.$numberDecimal);
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		return `new Decimal128(${inspect(this.toString(), options)})`;
	}
};
//#endregion
//#region src/double.ts
/**
* A class representation of the BSON Double type.
* @public
* @category BSONType
*/
var Double = class Double extends BSONValue {
	get _bsontype() {
		return "Double";
	}
	value;
	/**
	* Create a Double type
	*
	* @param value - the number we want to represent as a double.
	*/
	constructor(value) {
		super();
		if (value instanceof Number) value = value.valueOf();
		this.value = +value;
	}
	/**
	* Attempt to create an double type from string.
	*
	* This method will throw a BSONError on any string input that is not representable as a IEEE-754 64-bit double.
	* Notably, this method will also throw on the following string formats:
	* - Strings in non-decimal and non-exponential formats (binary, hex, or octal digits)
	* - Strings with characters other than numeric, floating point, or leading sign characters (Note: 'Infinity', '-Infinity', and 'NaN' input strings are still allowed)
	* - Strings with leading and/or trailing whitespace
	*
	* Strings with leading zeros, however, are also allowed
	*
	* @param value - the string we want to represent as a double.
	*/
	static fromString(value) {
		const coercedValue = Number(value);
		if (value === "NaN") return new Double(NaN);
		if (value === "Infinity") return new Double(Infinity);
		if (value === "-Infinity") return new Double(-Infinity);
		if (!Number.isFinite(coercedValue)) throw new BSONError(`Input: ${value} is not representable as a Double`);
		if (value.trim() !== value) throw new BSONError(`Input: '${value}' contains whitespace`);
		if (value === "") throw new BSONError(`Input is an empty string`);
		if (/[^-0-9.+eE]/.test(value)) throw new BSONError(`Input: '${value}' is not in decimal or exponential notation`);
		return new Double(coercedValue);
	}
	/**
	* Access the number value.
	*
	* @returns returns the wrapped double number.
	*/
	valueOf() {
		return this.value;
	}
	toJSON() {
		return this.value;
	}
	toString(radix) {
		return this.value.toString(radix);
	}
	/** @internal */
	toExtendedJSON(options) {
		if (options && (options.legacy || options.relaxed && isFinite(this.value))) return this.value;
		if (Object.is(Math.sign(this.value), -0)) return { $numberDouble: "-0.0" };
		return { $numberDouble: Number.isInteger(this.value) ? this.value.toFixed(1) : this.value.toString() };
	}
	/** @internal */
	static fromExtendedJSON(doc, options) {
		const doubleValue = parseFloat(doc.$numberDouble);
		return options && options.relaxed ? doubleValue : new Double(doubleValue);
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		return `new Double(${inspect(this.value, options)})`;
	}
};
//#endregion
//#region src/int_32.ts
/**
* A class representation of a BSON Int32 type.
* @public
* @category BSONType
*/
var Int32 = class Int32 extends BSONValue {
	get _bsontype() {
		return "Int32";
	}
	value;
	/**
	* Create an Int32 type
	*
	* @param value - the number we want to represent as an int32.
	*/
	constructor(value) {
		super();
		if (value instanceof Number) value = value.valueOf();
		this.value = +value | 0;
	}
	/**
	* Attempt to create an Int32 type from string.
	*
	* This method will throw a BSONError on any string input that is not representable as an Int32.
	* Notably, this method will also throw on the following string formats:
	* - Strings in non-decimal formats (exponent notation, binary, hex, or octal digits)
	* - Strings non-numeric and non-leading sign characters (ex: '2.0', '24,000')
	* - Strings with leading and/or trailing whitespace
	*
	* Strings with leading zeros, however, are allowed.
	*
	* @param value - the string we want to represent as an int32.
	*/
	static fromString(value) {
		const cleanedValue = removeLeadingZerosAndExplicitPlus(value);
		const coercedValue = Number(value);
		if (2147483647 < coercedValue) throw new BSONError(`Input: '${value}' is larger than the maximum value for Int32`);
		else if (-2147483648 > coercedValue) throw new BSONError(`Input: '${value}' is smaller than the minimum value for Int32`);
		else if (!Number.isSafeInteger(coercedValue)) throw new BSONError(`Input: '${value}' is not a safe integer`);
		else if (coercedValue.toString() !== cleanedValue) throw new BSONError(`Input: '${value}' is not a valid Int32 string`);
		return new Int32(coercedValue);
	}
	/**
	* Access the number value.
	*
	* @returns returns the wrapped int32 number.
	*/
	valueOf() {
		return this.value;
	}
	toString(radix) {
		return this.value.toString(radix);
	}
	toJSON() {
		return this.value;
	}
	/** @internal */
	toExtendedJSON(options) {
		if (options && (options.relaxed || options.legacy)) return this.value;
		return { $numberInt: this.value.toString() };
	}
	/** @internal */
	static fromExtendedJSON(doc, options) {
		return options && options.relaxed ? parseInt(doc.$numberInt, 10) : new Int32(doc.$numberInt);
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		return `new Int32(${inspect(this.value, options)})`;
	}
};
//#endregion
//#region src/max_key.ts
/**
* A class representation of the BSON MaxKey type.
* @public
* @category BSONType
*/
var MaxKey = class MaxKey extends BSONValue {
	get _bsontype() {
		return "MaxKey";
	}
	/** @internal */
	toExtendedJSON() {
		return { $maxKey: 1 };
	}
	/** @internal */
	static fromExtendedJSON() {
		return new MaxKey();
	}
	inspect() {
		return "new MaxKey()";
	}
};
//#endregion
//#region src/min_key.ts
/**
* A class representation of the BSON MinKey type.
* @public
* @category BSONType
*/
var MinKey = class MinKey extends BSONValue {
	get _bsontype() {
		return "MinKey";
	}
	/** @internal */
	toExtendedJSON() {
		return { $minKey: 1 };
	}
	/** @internal */
	static fromExtendedJSON() {
		return new MinKey();
	}
	inspect() {
		return "new MinKey()";
	}
};
//#endregion
//#region src/objectid.ts
let PROCESS_UNIQUE = null;
/** ObjectId hexString cache @internal */
const __idCache = /* @__PURE__ */ new WeakMap();
/**
* A class representation of the BSON ObjectId type.
* @public
* @category BSONType
*/
var ObjectId = class ObjectId extends BSONValue {
	get _bsontype() {
		return "ObjectId";
	}
	/** @internal */
	static index = Math.floor(Math.random() * 16777215);
	static cacheHexString;
	/** ObjectId Bytes @internal */
	buffer;
	/**
	* Create a new ObjectId.
	*
	* @param inputId - An input value to create a new ObjectId from.
	*/
	constructor(inputId) {
		super();
		let workingId;
		if (typeof inputId === "object" && inputId && "id" in inputId) {
			if (typeof inputId.id !== "string" && !ArrayBuffer.isView(inputId.id)) throw new BSONError("Argument passed in must have an id that is of type string or Buffer");
			if ("toHexString" in inputId && typeof inputId.toHexString === "function") workingId = ByteUtils.fromHex(inputId.toHexString());
			else workingId = inputId.id;
		} else workingId = inputId;
		if (workingId == null) this.buffer = ObjectId.generate();
		else if (ArrayBuffer.isView(workingId) && workingId.byteLength === 12) this.buffer = ByteUtils.toLocalBufferType(workingId);
		else if (typeof workingId === "string") if (ObjectId.validateHexString(workingId)) {
			this.buffer = ByteUtils.fromHex(workingId);
			if (ObjectId.cacheHexString) __idCache.set(this, workingId);
		} else throw new BSONError("input must be a 24 character hex string, 12 byte Uint8Array, or an integer");
		else throw new BSONError("Argument passed in does not match the accepted types");
	}
	/**
	* The ObjectId bytes
	* @readonly
	*/
	get id() {
		return this.buffer;
	}
	set id(value) {
		this.buffer = value;
		if (ObjectId.cacheHexString) __idCache.set(this, ByteUtils.toHex(value));
	}
	/**
	* @internal
	* Validates the input string is a valid hex representation of an ObjectId.
	*/
	static validateHexString(string) {
		if (string?.length !== 24) return false;
		for (let i = 0; i < 24; i++) {
			const char = string.charCodeAt(i);
			if (char >= 48 && char <= 57 || char >= 97 && char <= 102 || char >= 65 && char <= 70) continue;
			return false;
		}
		return true;
	}
	/** Returns the ObjectId id as a 24 lowercase character hex string representation */
	toHexString() {
		if (ObjectId.cacheHexString) {
			const __id = __idCache.get(this);
			if (__id) return __id;
		}
		const hexString = ByteUtils.toHex(this.id);
		if (ObjectId.cacheHexString) __idCache.set(this, hexString);
		return hexString;
	}
	/**
	* Update the ObjectId index
	* @internal
	*/
	static getInc() {
		return ObjectId.index = (ObjectId.index + 1) % 16777215;
	}
	/**
	* Generate a 12 byte id buffer used in ObjectId's
	*
	* @param time - pass in a second based timestamp.
	*/
	static generate(time) {
		if ("number" !== typeof time) time = Math.floor(Date.now() / 1e3);
		const inc = ObjectId.getInc();
		const buffer = ByteUtils.allocateUnsafe(12);
		NumberUtils.setInt32BE(buffer, 0, time);
		if (PROCESS_UNIQUE === null) PROCESS_UNIQUE = ByteUtils.randomBytes(5);
		buffer[4] = PROCESS_UNIQUE[0];
		buffer[5] = PROCESS_UNIQUE[1];
		buffer[6] = PROCESS_UNIQUE[2];
		buffer[7] = PROCESS_UNIQUE[3];
		buffer[8] = PROCESS_UNIQUE[4];
		buffer[11] = inc & 255;
		buffer[10] = inc >> 8 & 255;
		buffer[9] = inc >> 16 & 255;
		return buffer;
	}
	/**
	* Converts the id into a 24 character hex string for printing, unless encoding is provided.
	* @param encoding - hex or base64
	*/
	toString(encoding) {
		if (encoding === "base64") return ByteUtils.toBase64(this.id);
		if (encoding === "hex") return this.toHexString();
		return this.toHexString();
	}
	/** Converts to its JSON the 24 character hex string representation. */
	toJSON() {
		return this.toHexString();
	}
	/** @internal */
	static is(variable) {
		return variable != null && typeof variable === "object" && "_bsontype" in variable && variable._bsontype === "ObjectId";
	}
	/**
	* Compares the equality of this ObjectId with `otherID`.
	*
	* @param otherId - ObjectId instance to compare against.
	*/
	equals(otherId) {
		if (otherId === void 0 || otherId === null) return false;
		if (ObjectId.is(otherId)) return this.buffer[11] === otherId.buffer[11] && ByteUtils.equals(this.buffer, otherId.buffer);
		if (typeof otherId === "string") return otherId.toLowerCase() === this.toHexString();
		if (typeof otherId === "object" && typeof otherId.toHexString === "function") {
			const otherIdString = otherId.toHexString();
			const thisIdString = this.toHexString();
			return typeof otherIdString === "string" && otherIdString.toLowerCase() === thisIdString;
		}
		return false;
	}
	/** Returns the generation date (accurate up to the second) that this ID was generated. */
	getTimestamp() {
		const timestamp = /* @__PURE__ */ new Date();
		const time = NumberUtils.getUint32BE(this.buffer, 0);
		timestamp.setTime(Math.floor(time) * 1e3);
		return timestamp;
	}
	/** @internal */
	static createPk() {
		return new ObjectId();
	}
	/** @internal */
	serializeInto(uint8array, index) {
		uint8array[index] = this.buffer[0];
		uint8array[index + 1] = this.buffer[1];
		uint8array[index + 2] = this.buffer[2];
		uint8array[index + 3] = this.buffer[3];
		uint8array[index + 4] = this.buffer[4];
		uint8array[index + 5] = this.buffer[5];
		uint8array[index + 6] = this.buffer[6];
		uint8array[index + 7] = this.buffer[7];
		uint8array[index + 8] = this.buffer[8];
		uint8array[index + 9] = this.buffer[9];
		uint8array[index + 10] = this.buffer[10];
		uint8array[index + 11] = this.buffer[11];
		return 12;
	}
	/**
	* Creates an ObjectId from a second based number, with the rest of the ObjectId zeroed out. Used for comparisons or sorting the ObjectId.
	*
	* @param time - an integer number representing a number of seconds.
	*/
	static createFromTime(time) {
		const buffer = ByteUtils.allocate(12);
		for (let i = 11; i >= 4; i--) buffer[i] = 0;
		NumberUtils.setInt32BE(buffer, 0, time);
		return new ObjectId(buffer);
	}
	/**
	* Creates an ObjectId from a hex string representation of an ObjectId.
	*
	* @param hexString - create a ObjectId from a passed in 24 character hexstring.
	*/
	static createFromHexString(hexString) {
		if (hexString?.length !== 24) throw new BSONError("hex string must be 24 characters");
		return new ObjectId(ByteUtils.fromHex(hexString));
	}
	/** Creates an ObjectId instance from a base64 string */
	static createFromBase64(base64) {
		if (base64?.length !== 16) throw new BSONError("base64 string must be 16 characters");
		return new ObjectId(ByteUtils.fromBase64(base64));
	}
	/**
	* Checks if a value can be used to create a valid bson ObjectId
	* @param id - any JS value
	*/
	static isValid(id) {
		if (id == null) return false;
		if (typeof id === "string") return ObjectId.validateHexString(id);
		try {
			new ObjectId(id);
			return true;
		} catch {
			return false;
		}
	}
	/** @internal */
	toExtendedJSON() {
		if (this.toHexString) return { $oid: this.toHexString() };
		return { $oid: this.toString("hex") };
	}
	/** @internal */
	static fromExtendedJSON(doc) {
		return new ObjectId(doc.$oid);
	}
	/** @internal */
	isCached() {
		return ObjectId.cacheHexString && __idCache.has(this);
	}
	/**
	* Converts to a string representation of this Id.
	*
	* @returns return the 24 character hex string representation.
	*/
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		return `new ObjectId(${inspect(this.toHexString(), options)})`;
	}
};
//#endregion
//#region src/parser/calculate_size.ts
function internalCalculateObjectSize(object, serializeFunctions, ignoreUndefined) {
	let totalLength = 5;
	if (Array.isArray(object)) for (let i = 0; i < object.length; i++) totalLength += calculateElement(i.toString(), object[i], serializeFunctions, true, ignoreUndefined);
	else {
		if (typeof object?.toBSON === "function") object = object.toBSON();
		for (const key of Object.keys(object)) totalLength += calculateElement(key, object[key], serializeFunctions, false, ignoreUndefined);
	}
	return totalLength;
}
/** @internal */
function calculateElement(name, value, serializeFunctions = false, isArray = false, ignoreUndefined = false) {
	if (typeof value?.toBSON === "function") value = value.toBSON();
	switch (typeof value) {
		case "string": return 1 + ByteUtils.utf8ByteLength(name) + 1 + 4 + ByteUtils.utf8ByteLength(value) + 1;
		case "number": if (Math.floor(value) === value && value >= JS_INT_MIN && value <= JS_INT_MAX) if (value >= -2147483648 && value <= 2147483647) return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 5;
		else return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 9;
		else return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 9;
		case "undefined":
			if (isArray || !ignoreUndefined) return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 1;
			return 0;
		case "boolean": return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 2;
		case "object": if (value != null && typeof value._bsontype === "string" && value[BSON_VERSION_SYMBOL] !== 7) throw new BSONVersionError();
		else if (value == null || value._bsontype === "MinKey" || value._bsontype === "MaxKey") return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 1;
		else if (value._bsontype === "ObjectId") return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 13;
		else if (value instanceof Date || isDate(value)) return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 9;
		else if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || isAnyArrayBuffer(value)) return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 6 + value.byteLength;
		else if (value._bsontype === "Long" || value._bsontype === "Double" || value._bsontype === "Timestamp") return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 9;
		else if (value._bsontype === "Decimal128") return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 17;
		else if (value._bsontype === "Code") if (value.scope != null && Object.keys(value.scope).length > 0) return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 1 + 4 + 4 + ByteUtils.utf8ByteLength(value.code.toString()) + 1 + internalCalculateObjectSize(value.scope, serializeFunctions, ignoreUndefined);
		else return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 1 + 4 + ByteUtils.utf8ByteLength(value.code.toString()) + 1;
		else if (value._bsontype === "Binary") {
			const binary = value;
			if (binary.sub_type === Binary.SUBTYPE_BYTE_ARRAY) return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + (binary.position + 1 + 4 + 1 + 4);
			else return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + (binary.position + 1 + 4 + 1);
		} else if (value._bsontype === "Symbol") return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + ByteUtils.utf8ByteLength(value.value) + 4 + 1 + 1;
		else if (value._bsontype === "DBRef") {
			const ordered_values = Object.assign({
				$ref: value.collection,
				$id: value.oid
			}, value.fields);
			if (value.db != null) ordered_values["$db"] = value.db;
			return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 1 + internalCalculateObjectSize(ordered_values, serializeFunctions, ignoreUndefined);
		} else if (value instanceof RegExp || isRegExp(value)) return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 1 + ByteUtils.utf8ByteLength(value.source) + 1 + (value.global ? 1 : 0) + (value.ignoreCase ? 1 : 0) + (value.multiline ? 1 : 0) + 1;
		else if (value._bsontype === "BSONRegExp") return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 1 + ByteUtils.utf8ByteLength(value.pattern) + 1 + ByteUtils.utf8ByteLength(value.options) + 1;
		else return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + internalCalculateObjectSize(value, serializeFunctions, ignoreUndefined) + 1;
		case "function":
			if (serializeFunctions) return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 1 + 4 + ByteUtils.utf8ByteLength(value.toString()) + 1;
			return 0;
		case "bigint": return (name != null ? ByteUtils.utf8ByteLength(name) + 1 : 0) + 9;
		case "symbol": return 0;
		default: throw new BSONError(`Unrecognized JS type: ${typeof value}`);
	}
	return 0;
}
//#endregion
//#region src/regexp.ts
function alphabetize(str) {
	return str.split("").sort().join("");
}
/**
* A class representation of the BSON RegExp type.
* @public
* @category BSONType
*/
var BSONRegExp = class BSONRegExp extends BSONValue {
	get _bsontype() {
		return "BSONRegExp";
	}
	pattern;
	options;
	/**
	* @param pattern - The regular expression pattern to match
	* @param options - The regular expression options
	*/
	constructor(pattern, options) {
		super();
		this.pattern = pattern;
		this.options = alphabetize(options ?? "");
		if (this.pattern.indexOf("\0") !== -1) throw new BSONError(`BSON Regex patterns cannot contain null bytes, found: ${JSON.stringify(this.pattern)}`);
		if (this.options.indexOf("\0") !== -1) throw new BSONError(`BSON Regex options cannot contain null bytes, found: ${JSON.stringify(this.options)}`);
		for (let i = 0; i < this.options.length; i++) if (!(this.options[i] === "i" || this.options[i] === "m" || this.options[i] === "x" || this.options[i] === "l" || this.options[i] === "s" || this.options[i] === "u")) throw new BSONError(`The regular expression option [${this.options[i]}] is not supported`);
	}
	static parseOptions(options) {
		return options ? options.split("").sort().join("") : "";
	}
	/** @internal */
	toExtendedJSON(options) {
		options = options || {};
		if (options.legacy) return {
			$regex: this.pattern,
			$options: this.options
		};
		return { $regularExpression: {
			pattern: this.pattern,
			options: this.options
		} };
	}
	/** @internal */
	static fromExtendedJSON(doc) {
		if ("$regex" in doc) if (typeof doc.$regex !== "string") {
			if (doc.$regex._bsontype === "BSONRegExp") return doc;
		} else return new BSONRegExp(doc.$regex, BSONRegExp.parseOptions(doc.$options));
		if ("$regularExpression" in doc) return new BSONRegExp(doc.$regularExpression.pattern, BSONRegExp.parseOptions(doc.$regularExpression.options));
		throw new BSONError(`Unexpected BSONRegExp EJSON object form: ${JSON.stringify(doc)}`);
	}
	inspect(depth, options, inspect) {
		const stylize = getStylizeFunction(options) ?? ((v) => v);
		inspect ??= defaultInspect;
		return `new BSONRegExp(${stylize(inspect(this.pattern), "regexp")}, ${stylize(inspect(this.options), "regexp")})`;
	}
};
//#endregion
//#region src/symbol.ts
/**
* A class representation of the BSON Symbol type.
* @public
* @category BSONType
*/
var BSONSymbol = class BSONSymbol extends BSONValue {
	get _bsontype() {
		return "BSONSymbol";
	}
	value;
	/**
	* @param value - the string representing the symbol.
	*/
	constructor(value) {
		super();
		this.value = value;
	}
	/** Access the wrapped string value. */
	valueOf() {
		return this.value;
	}
	toString() {
		return this.value;
	}
	toJSON() {
		return this.value;
	}
	/** @internal */
	toExtendedJSON() {
		return { $symbol: this.value };
	}
	/** @internal */
	static fromExtendedJSON(doc) {
		return new BSONSymbol(doc.$symbol);
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		return `new BSONSymbol(${inspect(this.value, options)})`;
	}
};
//#endregion
//#region src/timestamp.ts
/** @public */
const LongWithoutOverridesClass = Long;
/**
* @public
* @category BSONType
*
* A special type for _internal_ MongoDB use and is **not** associated with the regular Date type.
*/
var Timestamp = class Timestamp extends LongWithoutOverridesClass {
	get _bsontype() {
		return "Timestamp";
	}
	get [bsonType]() {
		return "Timestamp";
	}
	static MAX_VALUE = Long.MAX_UNSIGNED_VALUE;
	/**
	* An incrementing ordinal for operations within a given second.
	*/
	get i() {
		return this.low >>> 0;
	}
	/**
	* A `time_t` value measuring seconds since the Unix epoch
	*/
	get t() {
		return this.high >>> 0;
	}
	constructor(low) {
		if (low == null) super(0, 0, true);
		else if (typeof low === "bigint") super(low, true);
		else if (Long.isLong(low)) super(low.low, low.high, true);
		else if (typeof low === "object" && "t" in low && "i" in low) {
			if (typeof low.t !== "number" && (typeof low.t !== "object" || low.t._bsontype !== "Int32")) throw new BSONError("Timestamp constructed from { t, i } must provide t as a number");
			if (typeof low.i !== "number" && (typeof low.i !== "object" || low.i._bsontype !== "Int32")) throw new BSONError("Timestamp constructed from { t, i } must provide i as a number");
			const t = Number(low.t);
			const i = Number(low.i);
			if (t < 0 || Number.isNaN(t)) throw new BSONError("Timestamp constructed from { t, i } must provide a positive t");
			if (i < 0 || Number.isNaN(i)) throw new BSONError("Timestamp constructed from { t, i } must provide a positive i");
			if (t > 4294967295) throw new BSONError("Timestamp constructed from { t, i } must provide t equal or less than uint32 max");
			if (i > 4294967295) throw new BSONError("Timestamp constructed from { t, i } must provide i equal or less than uint32 max");
			super(i, t, true);
		} else throw new BSONError("A Timestamp can only be constructed with: bigint, Long, or { t: number; i: number }");
	}
	toJSON() {
		return { $timestamp: this.toString() };
	}
	/** Returns a Timestamp represented by the given (32-bit) integer value. */
	static fromInt(value) {
		return new Timestamp(Long.fromInt(value, true));
	}
	/** Returns a Timestamp representing the given number value, provided that it is a finite number. Otherwise, zero is returned. */
	static fromNumber(value) {
		return new Timestamp(Long.fromNumber(value, true));
	}
	/**
	* Returns a Timestamp for the given high and low bits. Each is assumed to use 32 bits.
	*
	* @param lowBits - the low 32-bits.
	* @param highBits - the high 32-bits.
	*/
	static fromBits(lowBits, highBits) {
		return new Timestamp({
			i: lowBits,
			t: highBits
		});
	}
	/**
	* Returns a Timestamp from the given string, optionally using the given radix.
	*
	* @param str - the textual representation of the Timestamp.
	* @param optRadix - the radix in which the text is written.
	*/
	static fromString(str, optRadix) {
		return new Timestamp(Long.fromString(str, true, optRadix));
	}
	/** @internal */
	toExtendedJSON() {
		return { $timestamp: {
			t: this.t,
			i: this.i
		} };
	}
	/** @internal */
	static fromExtendedJSON(doc) {
		const i = Long.isLong(doc.$timestamp.i) ? doc.$timestamp.i.getLowBitsUnsigned() : doc.$timestamp.i;
		return new Timestamp({
			t: Long.isLong(doc.$timestamp.t) ? doc.$timestamp.t.getLowBitsUnsigned() : doc.$timestamp.t,
			i
		});
	}
	inspect(depth, options, inspect) {
		inspect ??= defaultInspect;
		return `new Timestamp({ t: ${inspect(this.t, options)}, i: ${inspect(this.i, options)} })`;
	}
};
//#endregion
//#region src/parser/deserializer.ts
const JS_INT_MAX_LONG = Long.fromNumber(JS_INT_MAX);
const JS_INT_MIN_LONG = Long.fromNumber(JS_INT_MIN);
function internalDeserialize(buffer, options, isArray) {
	options = options == null ? {} : options;
	const index = options && options.index ? options.index : 0;
	const size = NumberUtils.getInt32LE(buffer, index);
	if (size < 5) throw new BSONError(`bson size must be >= 5, is ${size}`);
	if (options.allowObjectSmallerThanBufferSize && buffer.length < size) throw new BSONError(`buffer length ${buffer.length} must be >= bson size ${size}`);
	if (!options.allowObjectSmallerThanBufferSize && buffer.length !== size) throw new BSONError(`buffer length ${buffer.length} must === bson size ${size}`);
	if (size + index > buffer.byteLength) throw new BSONError(`(bson size ${size} + options.index ${index} must be <= buffer length ${buffer.byteLength})`);
	if (buffer[index + size - 1] !== 0) throw new BSONError("One object, sized correctly, with a spot for an EOO, but the EOO isn't 0x00");
	return deserializeObject(buffer, index, options, isArray);
}
const allowedDBRefKeys = /^\$ref$|^\$id$|^\$db$/;
function deserializeObject(buffer, index, options, isArray = false) {
	const fieldsAsRaw = options["fieldsAsRaw"] == null ? null : options["fieldsAsRaw"];
	const raw = options["raw"] == null ? false : options["raw"];
	const bsonRegExp = typeof options["bsonRegExp"] === "boolean" ? options["bsonRegExp"] : false;
	const promoteBuffers = options.promoteBuffers ?? false;
	const promoteLongs = options.promoteLongs ?? true;
	const promoteValues = options.promoteValues ?? true;
	const useBigInt64 = options.useBigInt64 ?? false;
	if (useBigInt64 && !promoteValues) throw new BSONError("Must either request bigint or Long for int64 deserialization");
	if (useBigInt64 && !promoteLongs) throw new BSONError("Must either request bigint or Long for int64 deserialization");
	const validation = options.validation == null ? { utf8: true } : options.validation;
	let globalUTFValidation = true;
	let validationSetting;
	let utf8KeysSet;
	const utf8ValidatedKeys = validation.utf8;
	if (typeof utf8ValidatedKeys === "boolean") validationSetting = utf8ValidatedKeys;
	else {
		globalUTFValidation = false;
		const utf8ValidationValues = Object.keys(utf8ValidatedKeys).map(function(key) {
			return utf8ValidatedKeys[key];
		});
		if (utf8ValidationValues.length === 0) throw new BSONError("UTF-8 validation setting cannot be empty");
		if (typeof utf8ValidationValues[0] !== "boolean") throw new BSONError("Invalid UTF-8 validation option, must specify boolean values");
		validationSetting = utf8ValidationValues[0];
		if (!utf8ValidationValues.every((item) => item === validationSetting)) throw new BSONError("Invalid UTF-8 validation option - keys must be all true or all false");
	}
	if (!globalUTFValidation) {
		utf8KeysSet = /* @__PURE__ */ new Set();
		for (const key of Object.keys(utf8ValidatedKeys)) utf8KeysSet.add(key);
	}
	const startIndex = index;
	if (buffer.length < 5) throw new BSONError("corrupt bson message < 5 bytes long");
	const size = NumberUtils.getInt32LE(buffer, index);
	index += 4;
	if (size < 5 || size > buffer.length) throw new BSONError("corrupt bson message");
	const object = isArray ? [] : {};
	let arrayIndex = 0;
	let isPossibleDBRef = isArray ? false : null;
	while (true) {
		const elementType = buffer[index++];
		if (elementType === 0) break;
		let i = index;
		while (buffer[i] !== 0 && i < buffer.length) i++;
		if (i >= buffer.byteLength) throw new BSONError("Bad BSON Document: illegal CString");
		const name = isArray ? arrayIndex++ : ByteUtils.toUTF8(buffer, index, i, false);
		let shouldValidateKey = true;
		if (globalUTFValidation || utf8KeysSet?.has(name)) shouldValidateKey = validationSetting;
		else shouldValidateKey = !validationSetting;
		if (isPossibleDBRef !== false && name[0] === "$") isPossibleDBRef = allowedDBRefKeys.test(name);
		let value;
		index = i + 1;
		if (elementType === 2) {
			const stringSize = NumberUtils.getInt32LE(buffer, index);
			index += 4;
			if (stringSize <= 0 || stringSize > buffer.length - index || buffer[index + stringSize - 1] !== 0) throw new BSONError("bad string length in bson");
			value = ByteUtils.toUTF8(buffer, index, index + stringSize - 1, shouldValidateKey);
			index = index + stringSize;
		} else if (elementType === 7) {
			const oid = ByteUtils.allocateUnsafe(12);
			for (let i = 0; i < 12; i++) oid[i] = buffer[index + i];
			value = new ObjectId(oid);
			index = index + 12;
		} else if (elementType === 16 && promoteValues === false) {
			value = new Int32(NumberUtils.getInt32LE(buffer, index));
			index += 4;
		} else if (elementType === 16) {
			value = NumberUtils.getInt32LE(buffer, index);
			index += 4;
		} else if (elementType === 1) {
			value = NumberUtils.getFloat64LE(buffer, index);
			index += 8;
			if (promoteValues === false) value = new Double(value);
		} else if (elementType === 9) {
			const lowBits = NumberUtils.getInt32LE(buffer, index);
			const highBits = NumberUtils.getInt32LE(buffer, index + 4);
			index += 8;
			value = new Date(new Long(lowBits, highBits).toNumber());
		} else if (elementType === 8) {
			if (buffer[index] !== 0 && buffer[index] !== 1) throw new BSONError("illegal boolean type value");
			value = buffer[index++] === 1;
		} else if (elementType === 3) {
			const _index = index;
			const objectSize = NumberUtils.getInt32LE(buffer, index);
			if (objectSize <= 0 || objectSize > buffer.length - index) throw new BSONError("bad embedded document length in bson");
			if (raw) value = buffer.subarray(index, index + objectSize);
			else {
				let objectOptions = options;
				if (!globalUTFValidation) objectOptions = {
					...options,
					validation: { utf8: shouldValidateKey }
				};
				value = deserializeObject(buffer, _index, objectOptions, false);
			}
			index = index + objectSize;
		} else if (elementType === 4) {
			const _index = index;
			const objectSize = NumberUtils.getInt32LE(buffer, index);
			let arrayOptions = options;
			const stopIndex = index + objectSize;
			if (fieldsAsRaw && fieldsAsRaw[name]) arrayOptions = {
				...options,
				raw: true
			};
			if (!globalUTFValidation) arrayOptions = {
				...arrayOptions,
				validation: { utf8: shouldValidateKey }
			};
			value = deserializeObject(buffer, _index, arrayOptions, true);
			index = index + objectSize;
			if (buffer[index - 1] !== 0) throw new BSONError("invalid array terminator byte");
			if (index !== stopIndex) throw new BSONError("corrupted array bson");
		} else if (elementType === 6) value = void 0;
		else if (elementType === 10) value = null;
		else if (elementType === 18) if (useBigInt64) {
			value = NumberUtils.getBigInt64LE(buffer, index);
			index += 8;
		} else {
			const lowBits = NumberUtils.getInt32LE(buffer, index);
			const highBits = NumberUtils.getInt32LE(buffer, index + 4);
			index += 8;
			const long = new Long(lowBits, highBits);
			if (promoteLongs && promoteValues === true) value = long.lessThanOrEqual(JS_INT_MAX_LONG) && long.greaterThanOrEqual(JS_INT_MIN_LONG) ? long.toNumber() : long;
			else value = long;
		}
		else if (elementType === 19) {
			const bytes = ByteUtils.allocateUnsafe(16);
			for (let i = 0; i < 16; i++) bytes[i] = buffer[index + i];
			index = index + 16;
			value = new Decimal128(bytes);
		} else if (elementType === 5) {
			let binarySize = NumberUtils.getInt32LE(buffer, index);
			index += 4;
			const totalBinarySize = binarySize;
			const subType = buffer[index++];
			if (binarySize < 0) throw new BSONError("Negative binary type element size found");
			if (binarySize > buffer.byteLength) throw new BSONError("Binary type size larger than document size");
			if (subType === Binary.SUBTYPE_BYTE_ARRAY) {
				binarySize = NumberUtils.getInt32LE(buffer, index);
				index += 4;
				if (binarySize < 0) throw new BSONError("Negative binary type element size found for subtype 0x02");
				if (binarySize > totalBinarySize - 4) throw new BSONError("Binary type with subtype 0x02 contains too long binary size");
				if (binarySize < totalBinarySize - 4) throw new BSONError("Binary type with subtype 0x02 contains too short binary size");
			}
			if (promoteBuffers && promoteValues) value = ByteUtils.toLocalBufferType(buffer.subarray(index, index + binarySize));
			else {
				value = new Binary(buffer.subarray(index, index + binarySize), subType);
				if (subType === 4 && UUID.isValid(value)) value = value.toUUID();
			}
			index = index + binarySize;
		} else if (elementType === 11 && bsonRegExp === false) {
			i = index;
			while (buffer[i] !== 0 && i < buffer.length) i++;
			if (i >= buffer.length) throw new BSONError("Bad BSON Document: illegal CString");
			const source = ByteUtils.toUTF8(buffer, index, i, false);
			index = i + 1;
			i = index;
			while (buffer[i] !== 0 && i < buffer.length) i++;
			if (i >= buffer.length) throw new BSONError("Bad BSON Document: illegal CString");
			const regExpOptions = ByteUtils.toUTF8(buffer, index, i, false);
			index = i + 1;
			const optionsArray = new Array(regExpOptions.length);
			for (i = 0; i < regExpOptions.length; i++) switch (regExpOptions[i]) {
				case "m":
					optionsArray[i] = "m";
					break;
				case "s":
					optionsArray[i] = "g";
					break;
				case "i":
					optionsArray[i] = "i";
					break;
			}
			value = new RegExp(source, optionsArray.join(""));
		} else if (elementType === 11 && bsonRegExp === true) {
			i = index;
			while (buffer[i] !== 0 && i < buffer.length) i++;
			if (i >= buffer.length) throw new BSONError("Bad BSON Document: illegal CString");
			const source = ByteUtils.toUTF8(buffer, index, i, false);
			index = i + 1;
			i = index;
			while (buffer[i] !== 0 && i < buffer.length) i++;
			if (i >= buffer.length) throw new BSONError("Bad BSON Document: illegal CString");
			const regExpOptions = ByteUtils.toUTF8(buffer, index, i, false);
			index = i + 1;
			value = new BSONRegExp(source, regExpOptions);
		} else if (elementType === 14) {
			const stringSize = NumberUtils.getInt32LE(buffer, index);
			index += 4;
			if (stringSize <= 0 || stringSize > buffer.length - index || buffer[index + stringSize - 1] !== 0) throw new BSONError("bad string length in bson");
			const symbol = ByteUtils.toUTF8(buffer, index, index + stringSize - 1, shouldValidateKey);
			value = promoteValues ? symbol : new BSONSymbol(symbol);
			index = index + stringSize;
		} else if (elementType === 17) {
			value = new Timestamp({
				i: NumberUtils.getUint32LE(buffer, index),
				t: NumberUtils.getUint32LE(buffer, index + 4)
			});
			index += 8;
		} else if (elementType === 255) value = new MinKey();
		else if (elementType === 127) value = new MaxKey();
		else if (elementType === 13) {
			const stringSize = NumberUtils.getInt32LE(buffer, index);
			index += 4;
			if (stringSize <= 0 || stringSize > buffer.length - index || buffer[index + stringSize - 1] !== 0) throw new BSONError("bad string length in bson");
			value = new Code(ByteUtils.toUTF8(buffer, index, index + stringSize - 1, shouldValidateKey));
			index = index + stringSize;
		} else if (elementType === 15) {
			const totalSize = NumberUtils.getInt32LE(buffer, index);
			index += 4;
			if (totalSize < 13) throw new BSONError("code_w_scope total size shorter minimum expected length");
			const stringSize = NumberUtils.getInt32LE(buffer, index);
			index += 4;
			if (stringSize <= 0 || stringSize > buffer.length - index || buffer[index + stringSize - 1] !== 0) throw new BSONError("bad string length in bson");
			const functionString = ByteUtils.toUTF8(buffer, index, index + stringSize - 1, shouldValidateKey);
			index = index + stringSize;
			const _index = index;
			const objectSize = NumberUtils.getInt32LE(buffer, index);
			const scopeObject = deserializeObject(buffer, _index, options, false);
			index = index + objectSize;
			if (totalSize < 8 + objectSize + stringSize) throw new BSONError("code_w_scope total size is too short, truncating scope");
			if (totalSize > 8 + objectSize + stringSize) throw new BSONError("code_w_scope total size is too long, clips outer document");
			value = new Code(functionString, scopeObject);
		} else if (elementType === 12) {
			const stringSize = NumberUtils.getInt32LE(buffer, index);
			index += 4;
			if (stringSize <= 0 || stringSize > buffer.length - index || buffer[index + stringSize - 1] !== 0) throw new BSONError("bad string length in bson");
			const namespace = ByteUtils.toUTF8(buffer, index, index + stringSize - 1, shouldValidateKey);
			index = index + stringSize;
			const oidBuffer = ByteUtils.allocateUnsafe(12);
			for (let i = 0; i < 12; i++) oidBuffer[i] = buffer[index + i];
			const oid = new ObjectId(oidBuffer);
			index = index + 12;
			value = new DBRef(namespace, oid);
		} else throw new BSONError(`Detected unknown BSON type ${elementType.toString(16)} for fieldname "${name}"`);
		if (name === "__proto__") Object.defineProperty(object, name, {
			value,
			writable: true,
			enumerable: true,
			configurable: true
		});
		else object[name] = value;
	}
	if (size !== index - startIndex) {
		if (isArray) throw new BSONError("corrupt array bson");
		throw new BSONError("corrupt object bson");
	}
	if (!isPossibleDBRef) return object;
	if (isDBRefLike(object)) {
		const copy = Object.assign({}, object);
		delete copy.$ref;
		delete copy.$id;
		delete copy.$db;
		return new DBRef(object.$ref, object.$id, object.$db, copy);
	}
	return object;
}
//#endregion
//#region src/parser/serializer.ts
const regexp = /\x00/;
const ignoreKeys = new Set([
	"$db",
	"$ref",
	"$id",
	"$clusterTime"
]);
function serializeString(buffer, key, value, index) {
	buffer[index++] = 2;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes + 1;
	buffer[index - 1] = 0;
	const size = ByteUtils.encodeUTF8Into(buffer, value, index + 4);
	NumberUtils.setInt32LE(buffer, index, size + 1);
	index = index + 4 + size;
	buffer[index++] = 0;
	return index;
}
function serializeNumber(buffer, key, value, index) {
	const type = !Object.is(value, -0) && Number.isSafeInteger(value) && value <= 2147483647 && value >= -2147483648 ? 16 : 1;
	buffer[index++] = type;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	if (type === 16) index += NumberUtils.setInt32LE(buffer, index, value);
	else index += NumberUtils.setFloat64LE(buffer, index, value);
	return index;
}
function serializeBigInt(buffer, key, value, index) {
	buffer[index++] = 18;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index += numberOfWrittenBytes;
	buffer[index++] = 0;
	index += NumberUtils.setBigInt64LE(buffer, index, value);
	return index;
}
function serializeNull(buffer, key, _, index) {
	buffer[index++] = 10;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	return index;
}
function serializeBoolean(buffer, key, value, index) {
	buffer[index++] = 8;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	buffer[index++] = value ? 1 : 0;
	return index;
}
function serializeDate(buffer, key, value, index) {
	buffer[index++] = 9;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	const dateInMilis = Long.fromNumber(value.getTime());
	const lowBits = dateInMilis.getLowBits();
	const highBits = dateInMilis.getHighBits();
	index += NumberUtils.setInt32LE(buffer, index, lowBits);
	index += NumberUtils.setInt32LE(buffer, index, highBits);
	return index;
}
function serializeRegExp(buffer, key, value, index) {
	buffer[index++] = 11;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	if (value.source && value.source.match(regexp) != null) throw new BSONError("value " + value.source + " must not contain null bytes");
	index = index + ByteUtils.encodeUTF8Into(buffer, value.source, index);
	buffer[index++] = 0;
	if (value.ignoreCase) buffer[index++] = 105;
	if (value.global) buffer[index++] = 115;
	if (value.multiline) buffer[index++] = 109;
	buffer[index++] = 0;
	return index;
}
function serializeBSONRegExp(buffer, key, value, index) {
	buffer[index++] = 11;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	if (value.pattern.match(regexp) != null) throw new BSONError("pattern " + value.pattern + " must not contain null bytes");
	index = index + ByteUtils.encodeUTF8Into(buffer, value.pattern, index);
	buffer[index++] = 0;
	const sortedOptions = value.options.split("").sort().join("");
	index = index + ByteUtils.encodeUTF8Into(buffer, sortedOptions, index);
	buffer[index++] = 0;
	return index;
}
function serializeMinMax(buffer, key, value, index) {
	if (value === null) buffer[index++] = 10;
	else if (value._bsontype === "MinKey") buffer[index++] = 255;
	else buffer[index++] = 127;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	return index;
}
function serializeObjectId(buffer, key, value, index) {
	buffer[index++] = 7;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	index += value.serializeInto(buffer, index);
	return index;
}
function serializeBuffer(buffer, key, value, index) {
	buffer[index++] = 5;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	const size = value.length;
	index += NumberUtils.setInt32LE(buffer, index, size);
	buffer[index++] = 0;
	if (size <= 16) for (let i = 0; i < size; i++) buffer[index + i] = value[i];
	else buffer.set(value, index);
	index = index + size;
	return index;
}
function serializeObject(buffer, key, value, index, checkKeys, depth, serializeFunctions, ignoreUndefined, path) {
	if (path.has(value)) throw new BSONError("Cannot convert circular structure to BSON");
	path.add(value);
	buffer[index++] = Array.isArray(value) ? 4 : 3;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	const endIndex = serializeInto(buffer, value, checkKeys, index, depth + 1, serializeFunctions, ignoreUndefined, path);
	path.delete(value);
	return endIndex;
}
function serializeDecimal128(buffer, key, value, index) {
	buffer[index++] = 19;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	for (let i = 0; i < 16; i++) buffer[index + i] = value.bytes[i];
	return index + 16;
}
function serializeLong(buffer, key, value, index) {
	buffer[index++] = value._bsontype === "Long" ? 18 : 17;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	const lowBits = value.getLowBits();
	const highBits = value.getHighBits();
	index += NumberUtils.setInt32LE(buffer, index, lowBits);
	index += NumberUtils.setInt32LE(buffer, index, highBits);
	return index;
}
function serializeInt32(buffer, key, value, index) {
	value = value.valueOf();
	buffer[index++] = 16;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	index += NumberUtils.setInt32LE(buffer, index, value);
	return index;
}
function serializeDouble(buffer, key, value, index) {
	buffer[index++] = 1;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	index += NumberUtils.setFloat64LE(buffer, index, value.value);
	return index;
}
function serializeFunction(buffer, key, value, index) {
	buffer[index++] = 13;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	const functionString = value.toString();
	const size = ByteUtils.encodeUTF8Into(buffer, functionString, index + 4) + 1;
	NumberUtils.setInt32LE(buffer, index, size);
	index = index + 4 + size - 1;
	buffer[index++] = 0;
	return index;
}
function serializeCode(buffer, key, value, index, checkKeys = false, depth = 0, serializeFunctions = false, ignoreUndefined = true, path) {
	if (value.scope && typeof value.scope === "object") {
		buffer[index++] = 15;
		const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
		index = index + numberOfWrittenBytes;
		buffer[index++] = 0;
		let startIndex = index;
		const functionString = value.code;
		index = index + 4;
		const codeSize = ByteUtils.encodeUTF8Into(buffer, functionString, index + 4) + 1;
		NumberUtils.setInt32LE(buffer, index, codeSize);
		buffer[index + 4 + codeSize - 1] = 0;
		index = index + codeSize + 4;
		const endIndex = serializeInto(buffer, value.scope, checkKeys, index, depth + 1, serializeFunctions, ignoreUndefined, path);
		index = endIndex - 1;
		const totalSize = endIndex - startIndex;
		startIndex += NumberUtils.setInt32LE(buffer, startIndex, totalSize);
		buffer[index++] = 0;
	} else {
		buffer[index++] = 13;
		const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
		index = index + numberOfWrittenBytes;
		buffer[index++] = 0;
		const functionString = value.code.toString();
		const size = ByteUtils.encodeUTF8Into(buffer, functionString, index + 4) + 1;
		NumberUtils.setInt32LE(buffer, index, size);
		index = index + 4 + size - 1;
		buffer[index++] = 0;
	}
	return index;
}
function serializeBinary(buffer, key, value, index) {
	buffer[index++] = 5;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	const data = value.buffer;
	let size = value.position;
	if (value.sub_type === Binary.SUBTYPE_BYTE_ARRAY) size = size + 4;
	index += NumberUtils.setInt32LE(buffer, index, size);
	buffer[index++] = value.sub_type;
	if (value.sub_type === Binary.SUBTYPE_BYTE_ARRAY) {
		size = size - 4;
		index += NumberUtils.setInt32LE(buffer, index, size);
	}
	if (value.sub_type === Binary.SUBTYPE_VECTOR) validateBinaryVector(value);
	if (size <= 16) for (let i = 0; i < size; i++) buffer[index + i] = data[i];
	else buffer.set(data, index);
	index = index + value.position;
	return index;
}
function serializeSymbol(buffer, key, value, index) {
	buffer[index++] = 14;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	const size = ByteUtils.encodeUTF8Into(buffer, value.value, index + 4) + 1;
	NumberUtils.setInt32LE(buffer, index, size);
	index = index + 4 + size - 1;
	buffer[index++] = 0;
	return index;
}
function serializeDBRef(buffer, key, value, index, depth, serializeFunctions, path) {
	buffer[index++] = 3;
	const numberOfWrittenBytes = ByteUtils.encodeUTF8Into(buffer, key, index);
	index = index + numberOfWrittenBytes;
	buffer[index++] = 0;
	let startIndex = index;
	let output = {
		$ref: value.collection || value.namespace,
		$id: value.oid
	};
	if (value.db != null) output.$db = value.db;
	output = Object.assign(output, value.fields);
	const endIndex = serializeInto(buffer, output, false, index, depth + 1, serializeFunctions, true, path);
	const size = endIndex - startIndex;
	startIndex += NumberUtils.setInt32LE(buffer, index, size);
	return endIndex;
}
function serializeInto(buffer, object, checkKeys, startingIndex, depth, serializeFunctions, ignoreUndefined, path) {
	if (path == null) {
		if (object == null) {
			buffer[0] = 5;
			buffer[1] = 0;
			buffer[2] = 0;
			buffer[3] = 0;
			buffer[4] = 0;
			return 5;
		}
		if (Array.isArray(object)) throw new BSONError("serialize does not support an array as the root input");
		if (typeof object !== "object") throw new BSONError("serialize does not support non-object as the root input");
		else if ("_bsontype" in object && typeof object._bsontype === "string") throw new BSONError(`BSON types cannot be serialized as a document`);
		else if (isDate(object) || isRegExp(object) || isUint8Array(object) || isAnyArrayBuffer(object)) throw new BSONError(`date, regexp, typedarray, and arraybuffer cannot be BSON documents`);
		path = /* @__PURE__ */ new Set();
	}
	path.add(object);
	let index = startingIndex + 4;
	if (Array.isArray(object)) for (let i = 0; i < object.length; i++) {
		const key = `${i}`;
		let value = object[i];
		if (typeof value?.toBSON === "function") value = value.toBSON();
		const type = typeof value;
		if (value === void 0) index = serializeNull(buffer, key, value, index);
		else if (value === null) index = serializeNull(buffer, key, value, index);
		else if (type === "string") index = serializeString(buffer, key, value, index);
		else if (type === "number") index = serializeNumber(buffer, key, value, index);
		else if (type === "bigint") index = serializeBigInt(buffer, key, value, index);
		else if (type === "boolean") index = serializeBoolean(buffer, key, value, index);
		else if (type === "object" && value._bsontype == null) if (value instanceof Date || isDate(value)) index = serializeDate(buffer, key, value, index);
		else if (value instanceof Uint8Array || isUint8Array(value)) index = serializeBuffer(buffer, key, value, index);
		else if (value instanceof RegExp || isRegExp(value)) index = serializeRegExp(buffer, key, value, index);
		else index = serializeObject(buffer, key, value, index, checkKeys, depth, serializeFunctions, ignoreUndefined, path);
		else if (type === "object") {
			if (value[BSON_VERSION_SYMBOL] !== 7) throw new BSONVersionError();
			else if (value._bsontype === "ObjectId") index = serializeObjectId(buffer, key, value, index);
			else if (value._bsontype === "Decimal128") index = serializeDecimal128(buffer, key, value, index);
			else if (value._bsontype === "Long" || value._bsontype === "Timestamp") index = serializeLong(buffer, key, value, index);
			else if (value._bsontype === "Double") index = serializeDouble(buffer, key, value, index);
			else if (value._bsontype === "Code") index = serializeCode(buffer, key, value, index, checkKeys, depth, serializeFunctions, ignoreUndefined, path);
			else if (value._bsontype === "Binary") index = serializeBinary(buffer, key, value, index);
			else if (value._bsontype === "BSONSymbol") index = serializeSymbol(buffer, key, value, index);
			else if (value._bsontype === "DBRef") index = serializeDBRef(buffer, key, value, index, depth, serializeFunctions, path);
			else if (value._bsontype === "BSONRegExp") index = serializeBSONRegExp(buffer, key, value, index);
			else if (value._bsontype === "Int32") index = serializeInt32(buffer, key, value, index);
			else if (value._bsontype === "MinKey" || value._bsontype === "MaxKey") index = serializeMinMax(buffer, key, value, index);
			else if (typeof value._bsontype !== "undefined") throw new BSONError(`Unrecognized or invalid _bsontype: ${String(value._bsontype)}`);
		} else if (type === "function" && serializeFunctions) index = serializeFunction(buffer, key, value, index);
	}
	else if (object instanceof Map || isMap(object)) {
		const iterator = object.entries();
		let done = false;
		while (!done) {
			const entry = iterator.next();
			done = !!entry.done;
			if (done) continue;
			const key = entry.value ? entry.value[0] : void 0;
			let value = entry.value ? entry.value[1] : void 0;
			if (typeof value?.toBSON === "function") value = value.toBSON();
			const type = typeof value;
			if (typeof key === "string" && !ignoreKeys.has(key)) {
				if (key.match(regexp) != null) throw new BSONError("key " + key + " must not contain null bytes");
				if (checkKeys) {
					if ("$" === key[0]) throw new BSONError("key " + key + " must not start with '$'");
					else if (key.includes(".")) throw new BSONError("key " + key + " must not contain '.'");
				}
			}
			if (value === void 0) {
				if (ignoreUndefined === false) index = serializeNull(buffer, key, value, index);
			} else if (value === null) index = serializeNull(buffer, key, value, index);
			else if (type === "string") index = serializeString(buffer, key, value, index);
			else if (type === "number") index = serializeNumber(buffer, key, value, index);
			else if (type === "bigint") index = serializeBigInt(buffer, key, value, index);
			else if (type === "boolean") index = serializeBoolean(buffer, key, value, index);
			else if (type === "object" && value._bsontype == null) if (value instanceof Date || isDate(value)) index = serializeDate(buffer, key, value, index);
			else if (value instanceof Uint8Array || isUint8Array(value)) index = serializeBuffer(buffer, key, value, index);
			else if (value instanceof RegExp || isRegExp(value)) index = serializeRegExp(buffer, key, value, index);
			else index = serializeObject(buffer, key, value, index, checkKeys, depth, serializeFunctions, ignoreUndefined, path);
			else if (type === "object") {
				if (value[BSON_VERSION_SYMBOL] !== 7) throw new BSONVersionError();
				else if (value._bsontype === "ObjectId") index = serializeObjectId(buffer, key, value, index);
				else if (value._bsontype === "Decimal128") index = serializeDecimal128(buffer, key, value, index);
				else if (value._bsontype === "Long" || value._bsontype === "Timestamp") index = serializeLong(buffer, key, value, index);
				else if (value._bsontype === "Double") index = serializeDouble(buffer, key, value, index);
				else if (value._bsontype === "Code") index = serializeCode(buffer, key, value, index, checkKeys, depth, serializeFunctions, ignoreUndefined, path);
				else if (value._bsontype === "Binary") index = serializeBinary(buffer, key, value, index);
				else if (value._bsontype === "BSONSymbol") index = serializeSymbol(buffer, key, value, index);
				else if (value._bsontype === "DBRef") index = serializeDBRef(buffer, key, value, index, depth, serializeFunctions, path);
				else if (value._bsontype === "BSONRegExp") index = serializeBSONRegExp(buffer, key, value, index);
				else if (value._bsontype === "Int32") index = serializeInt32(buffer, key, value, index);
				else if (value._bsontype === "MinKey" || value._bsontype === "MaxKey") index = serializeMinMax(buffer, key, value, index);
				else if (typeof value._bsontype !== "undefined") throw new BSONError(`Unrecognized or invalid _bsontype: ${String(value._bsontype)}`);
			} else if (type === "function" && serializeFunctions) index = serializeFunction(buffer, key, value, index);
		}
	} else {
		if (typeof object?.toBSON === "function") {
			object = object.toBSON();
			if (object != null && typeof object !== "object") throw new BSONError("toBSON function did not return an object");
		}
		for (const key of Object.keys(object)) {
			let value = object[key];
			if (typeof value?.toBSON === "function") value = value.toBSON();
			const type = typeof value;
			if (typeof key === "string" && !ignoreKeys.has(key)) {
				if (key.match(regexp) != null) throw new BSONError("key " + key + " must not contain null bytes");
				if (checkKeys) {
					if ("$" === key[0]) throw new BSONError("key " + key + " must not start with '$'");
					else if (key.includes(".")) throw new BSONError("key " + key + " must not contain '.'");
				}
			}
			if (value === void 0) {
				if (ignoreUndefined === false) index = serializeNull(buffer, key, value, index);
			} else if (value === null) index = serializeNull(buffer, key, value, index);
			else if (type === "string") index = serializeString(buffer, key, value, index);
			else if (type === "number") index = serializeNumber(buffer, key, value, index);
			else if (type === "bigint") index = serializeBigInt(buffer, key, value, index);
			else if (type === "boolean") index = serializeBoolean(buffer, key, value, index);
			else if (type === "object" && value._bsontype == null) if (value instanceof Date || isDate(value)) index = serializeDate(buffer, key, value, index);
			else if (value instanceof Uint8Array || isUint8Array(value)) index = serializeBuffer(buffer, key, value, index);
			else if (value instanceof RegExp || isRegExp(value)) index = serializeRegExp(buffer, key, value, index);
			else index = serializeObject(buffer, key, value, index, checkKeys, depth, serializeFunctions, ignoreUndefined, path);
			else if (type === "object") {
				if (value[BSON_VERSION_SYMBOL] !== 7) throw new BSONVersionError();
				else if (value._bsontype === "ObjectId") index = serializeObjectId(buffer, key, value, index);
				else if (value._bsontype === "Decimal128") index = serializeDecimal128(buffer, key, value, index);
				else if (value._bsontype === "Long" || value._bsontype === "Timestamp") index = serializeLong(buffer, key, value, index);
				else if (value._bsontype === "Double") index = serializeDouble(buffer, key, value, index);
				else if (value._bsontype === "Code") index = serializeCode(buffer, key, value, index, checkKeys, depth, serializeFunctions, ignoreUndefined, path);
				else if (value._bsontype === "Binary") index = serializeBinary(buffer, key, value, index);
				else if (value._bsontype === "BSONSymbol") index = serializeSymbol(buffer, key, value, index);
				else if (value._bsontype === "DBRef") index = serializeDBRef(buffer, key, value, index, depth, serializeFunctions, path);
				else if (value._bsontype === "BSONRegExp") index = serializeBSONRegExp(buffer, key, value, index);
				else if (value._bsontype === "Int32") index = serializeInt32(buffer, key, value, index);
				else if (value._bsontype === "MinKey" || value._bsontype === "MaxKey") index = serializeMinMax(buffer, key, value, index);
				else if (typeof value._bsontype !== "undefined") throw new BSONError(`Unrecognized or invalid _bsontype: ${String(value._bsontype)}`);
			} else if (type === "function" && serializeFunctions) index = serializeFunction(buffer, key, value, index);
		}
	}
	path.delete(object);
	buffer[index++] = 0;
	const size = index - startingIndex;
	startingIndex += NumberUtils.setInt32LE(buffer, startingIndex, size);
	return index;
}
//#endregion
//#region src/extended_json.ts
function isBSONType(value) {
	return value != null && typeof value === "object" && "_bsontype" in value && typeof value._bsontype === "string";
}
const keysToCodecs = {
	$oid: ObjectId,
	$binary: Binary,
	$uuid: Binary,
	$symbol: BSONSymbol,
	$numberInt: Int32,
	$numberDecimal: Decimal128,
	$numberDouble: Double,
	$numberLong: Long,
	$minKey: MinKey,
	$maxKey: MaxKey,
	$regex: BSONRegExp,
	$regularExpression: BSONRegExp,
	$timestamp: Timestamp
};
function deserializeValue(value, options = {}) {
	if (typeof value === "number") {
		const in32BitRange = value <= 2147483647 && value >= -2147483648;
		const in64BitRange = value <= BSON_INT64_MAX && value >= BSON_INT64_MIN;
		if (options.relaxed || options.legacy) return value;
		if (Number.isInteger(value) && !Object.is(value, -0)) {
			if (in32BitRange) return new Int32(value);
			if (in64BitRange) {
				if (options.useBigInt64) return BigInt(value);
				return Long.fromNumber(value);
			}
		}
		return new Double(value);
	}
	if (value == null || typeof value !== "object") return value;
	if (value.$undefined) return null;
	const keys = Object.keys(value).filter((k) => k.startsWith("$") && value[k] != null);
	for (let i = 0; i < keys.length; i++) {
		const c = keysToCodecs[keys[i]];
		if (c) return c.fromExtendedJSON(value, options);
	}
	if (value.$date != null) {
		const d = value.$date;
		const date = /* @__PURE__ */ new Date();
		if (options.legacy) if (typeof d === "number") date.setTime(d);
		else if (typeof d === "string") date.setTime(Date.parse(d));
		else if (typeof d === "bigint") date.setTime(Number(d));
		else throw new BSONRuntimeError(`Unrecognized type for EJSON date: ${typeof d}`);
		else if (typeof d === "string") date.setTime(Date.parse(d));
		else if (Long.isLong(d)) date.setTime(d.toNumber());
		else if (typeof d === "number" && options.relaxed) date.setTime(d);
		else if (typeof d === "bigint") date.setTime(Number(d));
		else throw new BSONRuntimeError(`Unrecognized type for EJSON date: ${typeof d}`);
		return date;
	}
	if (value.$code != null) {
		const copy = Object.assign({}, value);
		if (value.$scope) copy.$scope = deserializeValue(value.$scope);
		return Code.fromExtendedJSON(value);
	}
	if (isDBRefLike(value) || value.$dbPointer) {
		const v = value.$ref ? value : value.$dbPointer;
		if (v instanceof DBRef) return v;
		const dollarKeys = Object.keys(v).filter((k) => k.startsWith("$"));
		let valid = true;
		dollarKeys.forEach((k) => {
			if ([
				"$ref",
				"$id",
				"$db"
			].indexOf(k) === -1) valid = false;
		});
		if (valid) return DBRef.fromExtendedJSON(v);
	}
	return value;
}
function serializeArray(array, options) {
	return array.map((v, index) => {
		options.seenObjects.push({
			propertyName: `index ${index}`,
			obj: null
		});
		try {
			return serializeValue(v, options);
		} finally {
			options.seenObjects.pop();
		}
	});
}
function getISOString(date) {
	const isoStr = date.toISOString();
	return date.getUTCMilliseconds() !== 0 ? isoStr : isoStr.slice(0, -5) + "Z";
}
function serializeValue(value, options) {
	if (value instanceof Map || isMap(value)) {
		const obj = Object.create(null);
		for (const [k, v] of value) {
			if (typeof k !== "string") throw new BSONError("Can only serialize maps with string keys");
			obj[k] = v;
		}
		return serializeValue(obj, options);
	}
	if ((typeof value === "object" || typeof value === "function") && value !== null) {
		const index = options.seenObjects.findIndex((entry) => entry.obj === value);
		if (index !== -1) {
			const props = options.seenObjects.map((entry) => entry.propertyName);
			const leadingPart = props.slice(0, index).map((prop) => `${prop} -> `).join("");
			const alreadySeen = props[index];
			const circularPart = " -> " + props.slice(index + 1, props.length - 1).map((prop) => `${prop} -> `).join("");
			const current = props[props.length - 1];
			throw new BSONError(`Converting circular structure to EJSON:
    ${leadingPart}${alreadySeen}${circularPart}${current}\n    ${" ".repeat(leadingPart.length + alreadySeen.length / 2)}\\${"-".repeat(circularPart.length + (alreadySeen.length + current.length) / 2 - 1)}/`);
		}
		options.seenObjects[options.seenObjects.length - 1].obj = value;
	}
	if (Array.isArray(value)) return serializeArray(value, options);
	if (value === void 0) return options.ignoreUndefined ? void 0 : null;
	if (value instanceof Date || isDate(value)) {
		const dateNum = value.getTime(), inRange = dateNum > -1 && dateNum < 0xe677d3328480;
		if (options.legacy) return options.relaxed && inRange ? { $date: value.getTime() } : { $date: getISOString(value) };
		return options.relaxed && inRange ? { $date: getISOString(value) } : { $date: { $numberLong: value.getTime().toString() } };
	}
	if (typeof value === "number" && (!options.relaxed || !isFinite(value))) {
		if (Number.isInteger(value) && !Object.is(value, -0)) {
			if (value >= -2147483648 && value <= 2147483647) return { $numberInt: value.toString() };
			if (value >= BSON_INT64_MIN && value <= BSON_INT64_MAX) return { $numberLong: value.toString() };
		}
		return { $numberDouble: Object.is(value, -0) ? "-0.0" : value.toString() };
	}
	if (typeof value === "bigint") {
		if (!options.relaxed) return { $numberLong: BigInt.asIntN(64, value).toString() };
		return Number(BigInt.asIntN(64, value));
	}
	if (value instanceof RegExp || isRegExp(value)) {
		let flags = value.flags;
		if (flags === void 0) {
			const match = value.toString().match(/[gimuy]*$/);
			if (match) flags = match[0];
		}
		return new BSONRegExp(value.source, flags).toExtendedJSON(options);
	}
	if (value != null && typeof value === "object") return serializeDocument(value, options);
	return value;
}
const BSON_TYPE_MAPPINGS = {
	Binary: (o) => new Binary(o.value(), o.sub_type),
	Code: (o) => new Code(o.code, o.scope),
	DBRef: (o) => new DBRef(o.collection || o.namespace, o.oid, o.db, o.fields),
	Decimal128: (o) => new Decimal128(o.bytes),
	Double: (o) => new Double(o.value),
	Int32: (o) => new Int32(o.value),
	Long: (o) => Long.fromBits(o.low != null ? o.low : o.low_, o.low != null ? o.high : o.high_, o.low != null ? o.unsigned : o.unsigned_),
	MaxKey: () => new MaxKey(),
	MinKey: () => new MinKey(),
	ObjectId: (o) => new ObjectId(o),
	BSONRegExp: (o) => new BSONRegExp(o.pattern, o.options),
	BSONSymbol: (o) => new BSONSymbol(o.value),
	Timestamp: (o) => Timestamp.fromBits(o.low, o.high)
};
function serializeDocument(doc, options) {
	if (doc == null || typeof doc !== "object") throw new BSONError("not an object instance");
	const bsontype = doc._bsontype;
	if (typeof bsontype === "undefined") {
		const _doc = {};
		for (const name of Object.keys(doc)) {
			options.seenObjects.push({
				propertyName: name,
				obj: null
			});
			try {
				const value = serializeValue(doc[name], options);
				if (name === "__proto__") Object.defineProperty(_doc, name, {
					value,
					writable: true,
					enumerable: true,
					configurable: true
				});
				else _doc[name] = value;
			} finally {
				options.seenObjects.pop();
			}
		}
		return _doc;
	} else if (doc != null && typeof doc === "object" && typeof doc._bsontype === "string" && doc[BSON_VERSION_SYMBOL] !== 7) throw new BSONVersionError();
	else if (isBSONType(doc)) {
		let outDoc = doc;
		if (typeof outDoc.toExtendedJSON !== "function") {
			const mapper = BSON_TYPE_MAPPINGS[doc._bsontype];
			if (!mapper) throw new BSONError("Unrecognized or invalid _bsontype: " + doc._bsontype);
			outDoc = mapper(outDoc);
		}
		if (bsontype === "Code" && outDoc.scope) outDoc = new Code(outDoc.code, serializeValue(outDoc.scope, options));
		else if (bsontype === "DBRef" && outDoc.oid) outDoc = new DBRef(serializeValue(outDoc.collection, options), serializeValue(outDoc.oid, options), serializeValue(outDoc.db, options), serializeValue(outDoc.fields, options));
		return outDoc.toExtendedJSON(options);
	} else throw new BSONError("_bsontype must be a string, but was: " + typeof bsontype);
}
/**
* Parse an Extended JSON string, constructing the JavaScript value or object described by that
* string.
*
* @example
* ```js
* const { EJSON } = require('bson');
* const text = '{ "int32": { "$numberInt": "10" } }';
*
* // prints { int32: { [String: '10'] _bsontype: 'Int32', value: '10' } }
* console.log(EJSON.parse(text, { relaxed: false }));
*
* // prints { int32: 10 }
* console.log(EJSON.parse(text));
* ```
*/
function parse(text, options) {
	const ejsonOptions = {
		useBigInt64: options?.useBigInt64 ?? false,
		relaxed: options?.relaxed ?? true,
		legacy: options?.legacy ?? false
	};
	return JSON.parse(text, (key, value) => {
		if (key.indexOf("\0") !== -1) throw new BSONError(`BSON Document field names cannot contain null bytes, found: ${JSON.stringify(key)}`);
		return deserializeValue(value, ejsonOptions);
	});
}
/**
* Converts a BSON document to an Extended JSON string, optionally replacing values if a replacer
* function is specified or optionally including only the specified properties if a replacer array
* is specified.
*
* @param value - The value to convert to extended JSON
* @param replacer - A function that alters the behavior of the stringification process, or an array of String and Number objects that serve as a whitelist for selecting/filtering the properties of the value object to be included in the JSON string. If this value is null or not provided, all properties of the object are included in the resulting JSON string
* @param space - A String or Number object that's used to insert white space into the output JSON string for readability purposes.
* @param options - Optional settings
*
* @example
* ```js
* const { EJSON } = require('bson');
* const Int32 = require('mongodb').Int32;
* const doc = { int32: new Int32(10) };
*
* // prints '{"int32":{"$numberInt":"10"}}'
* console.log(EJSON.stringify(doc, { relaxed: false }));
*
* // prints '{"int32":10}'
* console.log(EJSON.stringify(doc));
* ```
*/
function stringify(value, replacer, space, options) {
	if (space != null && typeof space === "object") {
		options = space;
		space = 0;
	}
	if (replacer != null && typeof replacer === "object" && !Array.isArray(replacer)) {
		options = replacer;
		replacer = void 0;
		space = 0;
	}
	const doc = serializeValue(value, Object.assign({
		relaxed: true,
		legacy: false
	}, options, { seenObjects: [{
		propertyName: "(root)",
		obj: null
	}] }));
	return JSON.stringify(doc, replacer, space);
}
/**
* Serializes an object to an Extended JSON string, and reparse it as a JavaScript object.
*
* @param value - The object to serialize
* @param options - Optional settings passed to the `stringify` function
*/
function EJSONserialize(value, options) {
	options = options || {};
	return JSON.parse(stringify(value, options));
}
/**
* Deserializes an Extended JSON object into a plain JavaScript object with native/BSON types
*
* @param ejson - The Extended JSON object to deserialize
* @param options - Optional settings passed to the parse method
*/
function EJSONdeserialize(ejson, options) {
	options = options || {};
	return parse(JSON.stringify(ejson), options);
}
/** @public */
const EJSON = Object.create(null);
EJSON.parse = parse;
EJSON.stringify = stringify;
EJSON.serialize = EJSONserialize;
EJSON.deserialize = EJSONdeserialize;
Object.freeze(EJSON);
//#endregion
//#region src/parser/on_demand/parse_to_elements.ts
/**
* @internal
*
* @remarks
* - This enum is const so the code we produce will inline the numbers
* - `minKey` is set to 255 so unsigned comparisons succeed
* - Modify with caution, double check the bundle contains literals
*/
const BSONElementType = {
	double: 1,
	string: 2,
	object: 3,
	array: 4,
	binData: 5,
	undefined: 6,
	objectId: 7,
	bool: 8,
	date: 9,
	null: 10,
	regex: 11,
	dbPointer: 12,
	javascript: 13,
	symbol: 14,
	javascriptWithScope: 15,
	int: 16,
	timestamp: 17,
	long: 18,
	decimal: 19,
	minKey: 255,
	maxKey: 127
};
function getSize(source, offset) {
	try {
		return NumberUtils.getNonnegativeInt32LE(source, offset);
	} catch (cause) {
		throw new BSONOffsetError("BSON size cannot be negative", offset, { cause });
	}
}
/**
* Searches for null terminator of a BSON element's value (Never the document null terminator)
* **Does not** bounds check since this should **ONLY** be used within parseToElements which has asserted that `bytes` ends with a `0x00`.
* So this will at most iterate to the document's terminator and error if that is the offset reached.
*/
function findNull(bytes, offset) {
	let nullTerminatorOffset = offset;
	for (; bytes[nullTerminatorOffset] !== 0; nullTerminatorOffset++);
	if (nullTerminatorOffset === bytes.length - 1) throw new BSONOffsetError("Null terminator not found", offset);
	return nullTerminatorOffset;
}
/**
* @public
* @experimental
*/
function parseToElements(bytes, startOffset = 0) {
	startOffset ??= 0;
	if (bytes.length < 5) throw new BSONOffsetError(`Input must be at least 5 bytes, got ${bytes.length} bytes`, startOffset);
	const documentSize = getSize(bytes, startOffset);
	if (documentSize > bytes.length - startOffset) throw new BSONOffsetError(`Parsed documentSize (${documentSize} bytes) does not match input length (${bytes.length} bytes)`, startOffset);
	if (bytes[startOffset + documentSize - 1] !== 0) throw new BSONOffsetError("BSON documents must end in 0x00", startOffset + documentSize);
	const elements = [];
	let offset = startOffset + 4;
	while (offset <= documentSize + startOffset) {
		const type = bytes[offset];
		offset += 1;
		if (type === 0) {
			if (offset - startOffset !== documentSize) throw new BSONOffsetError(`Invalid 0x00 type byte`, offset);
			break;
		}
		const nameOffset = offset;
		const nameLength = findNull(bytes, offset) - nameOffset;
		offset += nameLength + 1;
		let length;
		if (type === BSONElementType.double || type === BSONElementType.long || type === BSONElementType.date || type === BSONElementType.timestamp) length = 8;
		else if (type === BSONElementType.int) length = 4;
		else if (type === BSONElementType.objectId) length = 12;
		else if (type === BSONElementType.decimal) length = 16;
		else if (type === BSONElementType.bool) length = 1;
		else if (type === BSONElementType.null || type === BSONElementType.undefined || type === BSONElementType.maxKey || type === BSONElementType.minKey) length = 0;
		else if (type === BSONElementType.regex) length = findNull(bytes, findNull(bytes, offset) + 1) + 1 - offset;
		else if (type === BSONElementType.object || type === BSONElementType.array || type === BSONElementType.javascriptWithScope) length = getSize(bytes, offset);
		else if (type === BSONElementType.string || type === BSONElementType.binData || type === BSONElementType.dbPointer || type === BSONElementType.javascript || type === BSONElementType.symbol) {
			length = getSize(bytes, offset) + 4;
			if (type === BSONElementType.binData) length += 1;
			if (type === BSONElementType.dbPointer) length += 12;
		} else throw new BSONOffsetError(`Invalid 0x${type.toString(16).padStart(2, "0")} type byte`, offset);
		if (length > documentSize) throw new BSONOffsetError("value reports length larger than document", offset);
		elements.push([
			type,
			nameOffset,
			nameLength,
			offset,
			length
		]);
		offset += length;
	}
	return elements;
}
//#endregion
//#region src/parser/on_demand/index.ts
/**
* @experimental
* @public
*/
const onDemand = Object.create(null);
onDemand.parseToElements = parseToElements;
onDemand.ByteUtils = ByteUtils;
onDemand.NumberUtils = NumberUtils;
Object.freeze(onDemand);
//#endregion
//#region src/bson.ts
var bson_exports = /* @__PURE__ */ __exportAll({
	BSONError: () => BSONError,
	BSONOffsetError: () => BSONOffsetError,
	BSONRegExp: () => BSONRegExp,
	BSONRuntimeError: () => BSONRuntimeError,
	BSONSymbol: () => BSONSymbol,
	BSONType: () => BSONType,
	BSONValue: () => BSONValue,
	BSONVersionError: () => BSONVersionError,
	Binary: () => Binary,
	ByteUtils: () => ByteUtils,
	Code: () => Code,
	DBRef: () => DBRef,
	Decimal128: () => Decimal128,
	Double: () => Double,
	EJSON: () => EJSON,
	Int32: () => Int32,
	Long: () => Long,
	MaxKey: () => MaxKey,
	MinKey: () => MinKey,
	NumberUtils: () => NumberUtils,
	ObjectId: () => ObjectId,
	Timestamp: () => Timestamp,
	UUID: () => UUID,
	bsonType: () => bsonType,
	calculateObjectSize: () => calculateObjectSize,
	deserialize: () => deserialize,
	deserializeStream: () => deserializeStream,
	onDemand: () => onDemand,
	serialize: () => serialize,
	serializeWithBufferAndIndex: () => serializeWithBufferAndIndex,
	setInternalBufferSize: () => setInternalBufferSize
});
/** @internal */
const MAXSIZE = 1024 * 1024 * 17;
let buffer = ByteUtils.allocate(MAXSIZE);
/**
* Sets the size of the internal serialization buffer.
*
* @param size - The desired size for the internal serialization buffer in bytes
* @public
*/
function setInternalBufferSize(size) {
	if (buffer.length < size) buffer = ByteUtils.allocate(size);
}
/**
* Serialize a Javascript object.
*
* @param object - the Javascript object to serialize.
* @returns Buffer object containing the serialized object.
* @public
*/
function serialize(object, options = {}) {
	const checkKeys = typeof options.checkKeys === "boolean" ? options.checkKeys : false;
	const serializeFunctions = typeof options.serializeFunctions === "boolean" ? options.serializeFunctions : false;
	const ignoreUndefined = typeof options.ignoreUndefined === "boolean" ? options.ignoreUndefined : true;
	const minInternalBufferSize = typeof options.minInternalBufferSize === "number" ? options.minInternalBufferSize : MAXSIZE;
	if (buffer.length < minInternalBufferSize) buffer = ByteUtils.allocate(minInternalBufferSize);
	const serializationIndex = serializeInto(buffer, object, checkKeys, 0, 0, serializeFunctions, ignoreUndefined, null);
	const finishedBuffer = ByteUtils.allocateUnsafe(serializationIndex);
	finishedBuffer.set(buffer.subarray(0, serializationIndex), 0);
	return finishedBuffer;
}
/**
* Serialize a Javascript object using a predefined Buffer and index into the buffer,
* useful when pre-allocating the space for serialization.
*
* @param object - the Javascript object to serialize.
* @param finalBuffer - the Buffer you pre-allocated to store the serialized BSON object.
* @returns the index pointing to the last written byte in the buffer.
* @public
*/
function serializeWithBufferAndIndex(object, finalBuffer, options = {}) {
	const checkKeys = typeof options.checkKeys === "boolean" ? options.checkKeys : false;
	const serializeFunctions = typeof options.serializeFunctions === "boolean" ? options.serializeFunctions : false;
	const ignoreUndefined = typeof options.ignoreUndefined === "boolean" ? options.ignoreUndefined : true;
	const startIndex = typeof options.index === "number" ? options.index : 0;
	const serializationIndex = serializeInto(buffer, object, checkKeys, 0, 0, serializeFunctions, ignoreUndefined, null);
	finalBuffer.set(buffer.subarray(0, serializationIndex), startIndex);
	return startIndex + serializationIndex - 1;
}
/**
* Deserialize data as BSON.
*
* @param buffer - the buffer containing the serialized set of BSON documents.
* @returns returns the deserialized Javascript Object.
* @public
*/
function deserialize(buffer, options = {}) {
	return internalDeserialize(ByteUtils.toLocalBufferType(buffer), options);
}
/**
* Calculate the bson size for a passed in Javascript object.
*
* @param object - the Javascript object to calculate the BSON byte size for
* @returns size of BSON object in bytes
* @public
*/
function calculateObjectSize(object, options = {}) {
	options = options || {};
	return internalCalculateObjectSize(object, typeof options.serializeFunctions === "boolean" ? options.serializeFunctions : false, typeof options.ignoreUndefined === "boolean" ? options.ignoreUndefined : true);
}
/**
* Deserialize stream data as BSON documents.
*
* @param data - the buffer containing the serialized set of BSON documents.
* @param startIndex - the start index in the data Buffer where the deserialization is to start.
* @param numberOfDocuments - number of documents to deserialize.
* @param documents - an array where to store the deserialized documents.
* @param docStartIndex - the index in the documents array from where to start inserting documents.
* @param options - additional options used for the deserialization.
* @returns next index in the buffer after deserialization **x** numbers of documents.
* @public
*/
function deserializeStream(data, startIndex, numberOfDocuments, documents, docStartIndex, options) {
	const internalOptions = Object.assign({
		allowObjectSmallerThanBufferSize: true,
		index: 0
	}, options);
	const bufferData = ByteUtils.toLocalBufferType(data);
	let index = startIndex;
	for (let i = 0; i < numberOfDocuments; i++) {
		const size = NumberUtils.getInt32LE(bufferData, index);
		internalOptions.index = index;
		documents[docStartIndex + i] = internalDeserialize(bufferData, internalOptions);
		index = index + size;
	}
	return index;
}
//#endregion
export { bson_exports as BSON, BSONError, BSONOffsetError, BSONRegExp, BSONRuntimeError, BSONSymbol, BSONType, BSONValue, BSONVersionError, Binary, ByteUtils, Code, DBRef, Decimal128, Double, EJSON, Int32, Long, MaxKey, MinKey, NumberUtils, ObjectId, Timestamp, UUID, bsonType, calculateObjectSize, deserialize, deserializeStream, onDemand, serialize, serializeWithBufferAndIndex, setInternalBufferSize };
