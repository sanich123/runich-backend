import { styles } from './styles';

export function htmlTemplate(greeting: string) {
  return `<!doctype html>
           <html lang="en">
            <head>
             <meta name="viewport" content="width=device-width, initial-scale=1.0">
             <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
             <title>Simple Transactional Email</title>
            ${styles()}
            </head>
                <body>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="body">
      <tr>
        <td>&nbsp;</td>
        <td class="container">
          <div class="content">

            <!-- START CENTERED WHITE CONTAINER -->
            <span class="preheader">Уважаемый пользователь!</span>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="main">

              <!-- START MAIN CONTENT AREA -->
              <tr>
                <td class="wrapper">
                  <p>${greeting}</p>
                   <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="btn btn-primary">
                    <tbody>
                      <tr>
                        <td align="left">
                          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                            <tbody>
                              <tr>
                                <td> <a href="https://runich-with-api.netlify.com" target="_blank">Посмотреть в приложении</a></td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              <!-- END MAIN CONTENT AREA -->
              </table>

            <!-- START FOOTER -->
            <div class="footer">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="content-block">
                    <span class="apple-link">Runich Inc., Москва, улица Летчика Ульянина, д.2</span>
                    <br>Если Вы не хотите получать наши письма, отключите эту настройку в приложении.
                  </td>
                </tr>
                <tr>
                  <td class="content-block powered-by">
                    Powered by <a href="https://runich-with-api.netlify.com">Runich Inc.</a>
                  </td>
                </tr>
              </table>
            </div>

            <!-- END FOOTER -->
            
<!-- END CENTERED WHITE CONTAINER --></div>
        </td>
        <td>&nbsp;</td>
      </tr>
    </table>
  </body>
</html>`;
}
