import { NextResponse, type NextRequest } from "next/server";

// Barreira de UX: sem cookie de sessão → login. A validação real (assinatura, usuário ativo, perfil)
// é feita SEMPRE pela API; este arquivo nunca é a segurança.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!req.cookies.get("almox_token")) return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*"] };
