export function createHtml({
  name,
  surname,
  mapPhotoUrl = '',
  account,
}: {
  name: string;
  surname: string;
  mapPhotoUrl: string;
  account: { profilePhoto: string; name: string; surname: string };
}) {
  return `<p>Уважаемый ${name} ${surname}!</p>
        <img src="${account.profilePhoto}" width="100" height="100" style="object-fit: contain"/>
        <p>${account.name} ${account.surname} только что прокомментировал вашу активность!</p>
        ${mapPhotoUrl ? `<img src="${mapPhotoUrl}" width="99%"/>` : ''}`;
}
