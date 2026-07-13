import { redirect } from 'next/navigation'

// Client login is unified under the tenant's /login page. All roles
// (client_admin, client_sales_manager, client_user) sign in there and are
// routed by role afterwards.
export default function ClientAdminLoginPage() {
  redirect('/login')
}
