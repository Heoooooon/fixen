//! Minimal Accessibility FFI: caret bounds of the focused text field.
//! Used only when the user has granted Accessibility to the app; every call
//! degrades to None otherwise and the caller falls back to the mouse cursor.
#![cfg(target_os = "macos")]
#![allow(non_snake_case)]

use std::ffi::c_void;

type CFTypeRef = *const c_void;
type AXUIElementRef = CFTypeRef;
type CFStringRef = CFTypeRef;
type AXValueRef = CFTypeRef;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGPoint {
    x: f64,
    y: f64,
}
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGSize {
    width: f64,
    height: f64,
}
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CFRange {
    location: isize,
    length: isize,
}

const K_AX_VALUE_CGRECT: u32 = 3;
const K_AX_VALUE_CFRANGE: u32 = 4;
const K_CFSTRING_ENCODING_UTF8: u32 = 0x0800_0100;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> i32;
    fn AXUIElementCopyParameterizedAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        parameter: CFTypeRef,
        value: *mut CFTypeRef,
    ) -> i32;
    fn AXValueGetValue(value: AXValueRef, value_type: u32, out: *mut c_void) -> bool;
    fn AXValueCreate(value_type: u32, value: *const c_void) -> AXValueRef;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFStringCreateWithCString(
        alloc: CFTypeRef,
        c_str: *const std::os::raw::c_char,
        encoding: u32,
    ) -> CFStringRef;
    fn CFRelease(cf: CFTypeRef);
}

struct Released(CFTypeRef);
impl Drop for Released {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) };
        }
    }
}

fn cfstr(s: &str) -> Released {
    let c = std::ffi::CString::new(s).unwrap();
    Released(unsafe { CFStringCreateWithCString(std::ptr::null(), c.as_ptr(), K_CFSTRING_ENCODING_UTF8) })
}

pub fn trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

/// Bottom-left screen point of the caret / selection in the focused text
/// element (top-left origin coordinates), when Accessibility is granted.
pub fn caret_anchor() -> Option<(f64, f64)> {
    if !trusted() {
        return None;
    }
    unsafe {
        let system = Released(AXUIElementCreateSystemWide());

        let mut focused: CFTypeRef = std::ptr::null();
        let attr = cfstr("AXFocusedUIElement");
        if AXUIElementCopyAttributeValue(system.0, attr.0, &mut focused) != 0 || focused.is_null() {
            return None;
        }
        let focused = Released(focused);

        let mut range_value: CFTypeRef = std::ptr::null();
        let attr = cfstr("AXSelectedTextRange");
        if AXUIElementCopyAttributeValue(focused.0, attr.0, &mut range_value) != 0
            || range_value.is_null()
        {
            return None;
        }
        let range_value = Released(range_value);

        let mut range = CFRange::default();
        if !AXValueGetValue(range_value.0, K_AX_VALUE_CFRANGE, &mut range as *mut _ as *mut c_void) {
            return None;
        }
        // A zero-length caret still yields bounds for its position.
        let param = Released(AXValueCreate(K_AX_VALUE_CFRANGE, &range as *const _ as *const c_void));

        let mut bounds_value: CFTypeRef = std::ptr::null();
        let attr = cfstr("AXBoundsForRange");
        if AXUIElementCopyParameterizedAttributeValue(focused.0, attr.0, param.0, &mut bounds_value)
            != 0
            || bounds_value.is_null()
        {
            return None;
        }
        let bounds_value = Released(bounds_value);

        let mut rect = CGRect::default();
        if !AXValueGetValue(bounds_value.0, K_AX_VALUE_CGRECT, &mut rect as *mut _ as *mut c_void) {
            return None;
        }
        if rect.size.width == 0.0 && rect.size.height == 0.0 && rect.origin.x == 0.0 {
            return None;
        }
        Some((rect.origin.x, rect.origin.y + rect.size.height))
    }
}
