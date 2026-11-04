// CloudFront Function (cloudfront-js-2.0), viewer-request — spec §11.2.
// 1) www.<apex> → 301 https://<apex><đường dẫn chuẩn>   2) URL thư mục thiếu "/" → 301 thêm "/"
// 3) ".../" → ".../index.html" (static export Next, trailingSlash: true — ADR 0001).
// Không KeyValueStore (không có ở Free plan).

function queryString(qs) {
  var parts = [];
  for (var key in qs) {
    var item = qs[key];
    if (item.multiValue) {
      for (var i = 0; i < item.multiValue.length; i++) {
        parts.push(key + "=" + item.multiValue[i].value);
      }
    } else {
      parts.push(key + "=" + item.value);
    }
  }
  return parts.length ? "?" + parts.join("&") : "";
}

function needsSlash(uri) {
  if (uri.endsWith("/")) return false;
  var last = uri.substring(uri.lastIndexOf("/") + 1);
  return last.indexOf(".") === -1;
}

function redirect(location) {
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: { value: location },
      "cache-control": { value: "public, max-age=3600" },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- CloudFront runtime gọi handler()
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : "";
  var canonicalUri = needsSlash(uri) ? uri + "/" : uri;

  if (host.indexOf("www.") === 0) {
    return redirect("https://" + host.substring(4) + canonicalUri + queryString(request.querystring));
  }

  if (canonicalUri !== uri) {
    return redirect(canonicalUri + queryString(request.querystring));
  }

  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  }
  return request;
}
