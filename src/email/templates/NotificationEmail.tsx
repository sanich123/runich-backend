import { Heading, Img, Link, Section, Text } from '@react-email/components';

import { EmailButton } from './EmailButton';
import { EmailLayout } from './EmailLayout';
import { NotificationActor } from './NotificationActor';
import { emailStyles, notificationStyles } from './const';
import { HEADING, PARAGRAPH } from './types';
import type { NotificationEmailProps } from './types';

export function NotificationEmail({
  type,
  name,
  surname,
  recepientName,
  recepientSurname,
  profilePhoto,
  mapPhotoUrl,
  activityUrl,
  comment,
}: NotificationEmailProps) {
  return (
    <EmailLayout preview={HEADING[type]}>
      <Heading as="h1" style={emailStyles.title}>
        {HEADING[type]}
      </Heading>
      <Text style={emailStyles.paragraph}>
        Привет, {recepientName} {recepientSurname}!
      </Text>

      <NotificationActor name={name} surname={surname} profilePhoto={profilePhoto} description={PARAGRAPH[type]} />

      {comment && <Text style={notificationStyles.comment}>«{comment}»</Text>}

      {mapPhotoUrl && (
        <Section style={notificationStyles.mapSection}>
          {activityUrl ? (
            <Link href={activityUrl}>
              <Img
                src={mapPhotoUrl}
                width="100%"
                alt="Открыть активность в Runich"
                style={notificationStyles.mapImage}
              />
            </Link>
          ) : (
            <Img src={mapPhotoUrl} width="100%" alt="Изображение активности" style={notificationStyles.mapImage} />
          )}
        </Section>
      )}

      <EmailButton href={activityUrl ?? 'https://runich-app.ru'} variant="notification">
        {activityUrl ? 'Открыть активность в Runich' : 'Открыть приложение Runich'}
      </EmailButton>
    </EmailLayout>
  );
}
