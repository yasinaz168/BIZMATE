import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Middleware berguna untuk:
 * 1. Menyegarkan session Supabase (cookies) di setiap request.
 *    Ini WAJIB — client di browser tidak bisa dipercaya sepenuhnya.
 * 2. Protected routes: halaman aplikasi hanya untuk pengguna yang login.
 * 3. Pengguna yang sudah login tidak perlu buka login/register lagi.
 *
 * NOTE: pengecekan "punya bisnis atau belum" dilakukan di layout
 * (perlu query database), bukan di sini.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/transaksi",
  "/assistant",
  "/produk",
  "/laporan",
  "/pengaturan",
  "/onboarding",
];

const AUTH_PAGES = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Aplikasi tetap hidup (menampilkan SetupNotice) bila env belum diisi
  const config = getSupabaseConfig();
  if (!config) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    config.url,
    config.key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser() selalu validasi token ke server Supabase
  // (bukan sekadar cek cookie ada)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  // Belum login + halaman terlindungi → ke /login (simpan tujuan asal)
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Sudah login tapi membuka login/register → ke dashboard
  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Semua kecuali: static files, image optimization, api.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
