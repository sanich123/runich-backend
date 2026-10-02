import { Column, Img, Row, Section, Text } from '@react-email/components';

import { notificationStyles } from './const';
import type { NotificationActorProps } from './types';

export function NotificationActor({ name, surname, profilePhoto, description }: NotificationActorProps) {
  return (
    <Section style={notificationStyles.actorCard}>
      <Row>
        <Column style={notificationStyles.avatarColumn}>
          {profilePhoto ? (
            <Img
              src={profilePhoto}
              width="40"
              height="40"
              alt="Аватар пользователя"
              style={notificationStyles.avatar}
            />
          ) : (
            <Section style={notificationStyles.avatarFallback}>{(name || 'R').slice(0, 1).toUpperCase()}</Section>
          )}
        </Column>
        <Column>
          <Text style={notificationStyles.actorText}>
            <strong>
              {name} {surname}
            </strong>
            <br />
            <span style={notificationStyles.actorDescription}>{description}</span>
          </Text>
        </Column>
      </Row>
    </Section>
  );
}
