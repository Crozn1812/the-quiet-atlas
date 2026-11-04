// CloudFront Function (cloudfront-js-2.0), viewer-response — spec §11.2.
// Header bổ sung ngoài managed SecurityHeadersPolicy (HSTS, nosniff, X-Frame-Options, Referrer-Policy):
//   - Permissions-Policy: tắt API thiết bị site không dùng.
//   - CSP chỉ có frame-ancestors (không đặt được qua <meta>); CSP script nằm trong <meta> sinh lúc build.
//     Hai policy cùng có hiệu lực.

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- CloudFront runtime gọi handler()
function handler(event) {
  var response = event.response;
  var headers = response.headers;

  headers["permissions-policy"] = {
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
  headers["content-security-policy"] = { value: "frame-ancestors 'none'" };

  return response;
}
