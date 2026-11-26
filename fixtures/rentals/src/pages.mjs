// HTML for the two pages. Plain strings, no template library.
export const escape = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const layout = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #222; }
  table { width: 720px; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; white-space: nowrap; }
  form { display: grid; gap: 8px; max-width: 360px; }
  input, textarea, button { font: inherit; padding: 6px; }
  .muted { color: #aaa; }
</style>
</head>
<body>${body}</body>
</html>`;

export const listingsPage = (listings, user) => layout('Rentals', `
<h1>Rentals</h1>
<p class="muted">${user ? `Signed in as ${escape(user.name)}` : '<a href="/login">Sign in</a> to apply'}</p>
<table>
  <tr><th>Listing</th><th>Street</th><th>Rent</th><th>Units free</th><th></th></tr>
  ${listings.map((l) => `<tr>
    <td>${escape(l.title)}</td>
    <td>${escape(l.street)}</td>
    <td>$${l.rent}</td>
    <td>${l.free} of ${l.units}</td>
    <td><a href="/apply?listing=${l.id}">Apply</a></td>
  </tr>`).join('')}
</table>`);

export const loginPage = (error) => layout('Sign in', `
<h1>Sign in</h1>
${error ? `<p>${escape(error)}</p>` : ''}
<form method="post" action="/login">
  <input name="email" placeholder="Email">
  <input name="password" type="password" placeholder="Password">
  <button>Sign in</button>
</form>`);

export const applyPage = (listing) => layout('Apply', `
<h1>Apply for ${escape(listing.title)}</h1>
<form method="post" action="/apply">
  <input type="hidden" name="listing" value="${listing.id}">
  <input name="phone" placeholder="Phone">
  <textarea name="message" rows="5" placeholder="Tell the owner about yourself"></textarea>
  <button>Send application</button>
</form>`);

export const applicationPage = (application) => layout('Application', `
<h1>Application ${application.id}</h1>
<p>For: ${escape(application.title)}</p>
<p>Phone: ${escape(application.phone ?? '')}</p>
<div>${application.message ?? ''}</div>
<p><a href="/">Back to rentals</a></p>`);
