const PDFS = {
  "1": {
    fileName: "1.pdf",
    sha256: "0459E951D6109819075A33393ED05FAF3DBEC3825B9870C1FEED0C367E51B3FF"
  },
  "2": {
    fileName: "2.pdf",
    sha256: "4C96CB64B6AD66EB58459DCD3F73562D4BA05F1BCA7B94BB5584CF09FDDB98D7"
  },
  "3": {
    fileName: "3.pdf",
    sha256: "7A8889BECA5AD60DD4B9B11173123084F47C53F37E9CC9F26DA10407A7B3BAF7"
  },
  "4": {
    fileName: "4.pdf",
    sha256: "57F399CAC69FE8F32E718C4074ACA5BAEB28001155CB1F3DA4768FFB9B92AF8A"
  }
};

const RELEASE_BASE =
  "https://github.com/ArquiParamo/Planchas/releases/download/original-pdfs";

function forwardedHeaders(request) {
  const headers = new Headers();
  for (const name of ["range", "if-range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("accept-encoding", "identity");
  return headers;
}

function responseHeaders(upstream, pdf, download) {
  const headers = new Headers();
  headers.set("content-type", "application/pdf");
  headers.set(
    "content-disposition",
    `${download ? "attachment" : "inline"}; filename="plancha-${pdf.fileName}"`
  );
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-original-sha256", pdf.sha256);

  for (const name of ["accept-ranges", "content-range", "content-length", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function onRequest({ request, params }) {
  const id = params.id;
  const pdf = PDFS[id];
  if (!pdf) {
    return new Response("PDF no encontrado", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const download = requestUrl.searchParams.get("download") === "1";
  const upstreamUrl = `${RELEASE_BASE}/${pdf.fileName}`;
  const upstream = await fetch(upstreamUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: forwardedHeaders(request),
    redirect: "follow"
  });

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    return new Response("No se pudo cargar el PDF original", { status: upstream.status });
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream, pdf, download)
  });
}
