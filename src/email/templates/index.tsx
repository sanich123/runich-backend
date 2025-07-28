import {
  Body,
  Container,
  Column,
  Head,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
  Heading,
  Tailwind,
  Link,
} from '@react-email/components';
import * as React from 'react';

import { HEADING, NotificationEmailProps, PARAGRAPH } from './types';

export function SimpleText({ text, accessToken }: { text: string; accessToken: string }) {
  console.log(accessToken);
  return (
    <Html>
      <Link href={`https://runich.expo.app/sign-in?accessToken=${accessToken}`}>Перейдите по ссылке</Link>
      <Text>{text}</Text>
    </Html>
  );
}

export function NotificationEmail({
  type,
  name,
  surname,
  recepientName,
  recepientSurname,
  profilePhoto,
  mapPhotoUrl,
  comment,
}: NotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{HEADING[type]}</Preview>
      <Tailwind>
        <Body className="bg-white my-auto mx-auto font-sans px-2">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]">
            <Section>
              <Column align="center">
                <Img src="https://i.postimg.cc/NMB5rvQ4/icon.png" width="60" height="60" alt="Runich" />
                <Heading as="h2">{HEADING[type]}</Heading>
                <Text>
                  Привет, {recepientName} {recepientSurname}!
                </Text>
              </Column>
            </Section>

            <Section>
              <Column align="left" style={{ margin: 0 }}>
                <Row align="left">
                  <Img
                    style={{ borderRadius: '50%' }}
                    src={profilePhoto}
                    width="40"
                    height="40"
                    alt="avatar of the user"
                  />
                  <Text style={{ margin: 0, padding: 0 }}>
                    <strong>
                      {name} {surname}
                    </strong>
                  </Text>
                </Row>
              </Column>
            </Section>
            {comment && (
              <Text className="text-black text-[16px] leading-[24px]">
                <i>{comment}</i>
              </Text>
            )}

            <Text className="text-black text-[14px] leading-[24px]">{PARAGRAPH[type]}</Text>
            {mapPhotoUrl && (
              <Section>
                <Row>
                  <Column align="center">
                    <Img src={mapPhotoUrl} width="100%" height="50%" alt="activity image" />
                  </Column>
                </Row>
              </Section>
            )}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
