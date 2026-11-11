/**
 * 개인정보처리방침 — 개인정보 보호법상 필수 고지 사항을 담은 법적 문서라
 * 일반 UI 문구(translations.ts)와 분리해 여기 따로 둔다. 길이가 길어서
 * translations.ts에 넣으면 그 파일의 "짧은 UI 문구" 성격과 안 맞고,
 * 나중에 조항만 따로 검토·수정하기도 이 편이 훨씬 쉽다.
 *
 * 내용을 바꿀 땐 반드시 ko/en의 effectiveDateLabel(시행일)도 실제 반영일로
 * 같이 갱신할 것 — "변경 이력"의 근거가 되는 값이다.
 */

export type PrivacyPolicySection = {
  heading: string;
  /** 문단 여러 개는 빈 줄로 구분한 하나의 문자열로 넣는다(화면에서 줄바꿈 두 번으로 렌더링). */
  body: string;
};

export type PrivacyPolicyContent = {
  title: string;
  effectiveDateLabel: string;
  intro: string;
  sections: PrivacyPolicySection[];
};

export const PRIVACY_POLICY_CONTACT_EMAIL = 'whsaktxod223@gmail.com';

const ko: PrivacyPolicyContent = {
  title: 'DAY 개인정보처리방침',
  effectiveDateLabel: '시행일: 2026년 11월 11일',
  intro:
    'DAY(이하 "서비스")를 만든 개발자(이하 "개발자")는 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 이 개인정보처리방침은 서비스가 어떤 개인정보를 수집하고, 어떻게 이용·보관하며, 이용자가 어떤 권리를 행사할 수 있는지 안내합니다.',
  sections: [
    {
      heading: '1. 수집하는 개인정보 항목',
      body:
        '필수: 이메일 주소, 비밀번호(암호화되어 저장되며 개발자를 포함해 누구도 열람할 수 없습니다), 닉네임\n선택: 프로필 사진\n\n소셜 로그인(Google, Kakao) 이용 시: 해당 계정의 이메일, 이름(닉네임), 프로필 사진 — 이용자가 로그인 과정에서 동의한 정보만 전달받습니다.\n\n서비스 이용 중 만들어지는 정보: 작성한 게시물(제목, 본문, 사진, 기분 태그, 공개범위, 태그한 친구), 선택적으로 첨부하는 위치 정보(게시물 작성 화면에서 직접 켰을 때만 수집되는 GPS 좌표 및 장소명), 댓글, 좋아요, 친구·친구그룹·차단 목록, 신고 내용, 펫 편지(친구와 주고받은 메시지·답장 내용과 보낸 시각, 손상 여부), 펫 정보(이름, 종, 성격, 친밀도, 배달 기록)\n\n자동으로 수집되는 정보: 푸시 알림 발송을 위한 기기 푸시 토큰, 알림·언어·화면테마 설정, 서비스 접속 기록 및 IP 주소(오류 대응, 부정 이용 방지 목적)',
    },
    {
      heading: '2. 개인정보의 수집 및 이용 목적',
      body:
        '회원 가입 의사 확인, 본인 확인(이메일 인증), 회원제 서비스 제공\n게시물 작성·공유 및 친구·소셜 기능 제공\n댓글, 좋아요, 친구 요청 등에 대한 푸시 알림 발송\n부정 이용 방지, 신고 처리, 서비스 품질 개선',
    },
    {
      heading: '3. 개인정보의 보유 및 이용 기간',
      body:
        '회원 탈퇴 시 지체 없이 파기함을 원칙으로 합니다. 탈퇴 즉시 닉네임·프로필 사진·이메일 연결 정보는 삭제·익명화되어 "탈퇴한 사용자"로 표시됩니다.\n\n다만 탈퇴 전에 작성한 게시물·댓글 자체는 다른 이용자와의 좋아요·댓글 등 상호작용 정합성을 지키기 위해 자동으로 삭제되지 않고, 작성자 표시만 "탈퇴한 사용자"로 바뀝니다. 게시물 삭제를 원하면 탈퇴하기 전에 직접 삭제해 주세요.\n\n관계 법령에 특별한 규정이 있는 경우 해당 법령이 정한 기간 동안 보관합니다.',
    },
    {
      heading: '4. 개인정보 처리의 위탁',
      body:
        '서비스 운영을 위해 아래 업체에 개인정보 처리업무 일부를 위탁하고 있습니다.\n\n· Google LLC (Firebase — Authentication/Firestore/Cloud Storage/Cloud Functions/Hosting): 회원 인증, 데이터 저장, 서버 처리, 웹 호스팅\n· Google LLC (Google 로그인): 소셜 로그인\n· Kakao Corp. (카카오 로그인): 소셜 로그인\n· Expo (푸시 알림 서비스): 알림 발송\n\n서비스가 Google의 글로벌 인프라를 사용하는 특성상, 위 위탁 과정에서 개인정보가 국외 서버에 저장·처리될 수 있습니다.',
    },
    {
      heading: '5. 개인정보의 제3자 제공',
      body:
        '개발자는 이용자의 개인정보를 위 처리위탁 범위를 넘어 외부에 제공하지 않습니다. 다만 법령에 근거가 있거나 수사기관이 적법한 절차와 방법에 따라 요청하는 경우는 예외로 합니다.',
    },
    {
      heading: '6. 정보주체의 권리와 행사 방법',
      body:
        '이용자는 앱 내 "프로필 편집" 화면에서 닉네임·프로필 사진·자기소개를 언제든 직접 열람·수정할 수 있고, 회원 탈퇴를 통해 삭제를 요청할 수 있습니다.\n\n그 밖에 개인정보 열람·정정·삭제·처리정지를 원하시면 아래 연락처로 문의해 주세요. 요청인 본인 확인 후 지체 없이 조치합니다.',
    },
    {
      heading: '7. 개인정보의 파기 절차 및 방법',
      body:
        '전자적 파일 형태로 저장된 개인정보는 복구할 수 없는 방법으로 영구 삭제합니다. 회원 탈퇴, 보유기간 경과 등 파기 사유가 발생하면 지체 없이 파기합니다.',
    },
    {
      heading: '8. 개인정보의 안전성 확보 조치',
      body:
        'Google Firebase의 보안 인프라(전송구간 암호화 HTTPS/TLS, 저장 데이터 암호화)를 사용합니다.\nFirestore 보안 규칙으로 본인이거나 공개범위에 해당하는 이용자만 데이터에 접근할 수 있도록 제한합니다.\n비밀번호는 Firebase Authentication에 의해 암호화되어 저장되며 개발자도 열람할 수 없습니다.\n사진 원본은 공개 URL 없이, 서버가 매 요청마다 그 시점의 공개범위를 확인한 뒤에만 전송합니다.',
    },
    {
      heading: '9. 쿠키 등 자동 수집 장치',
      body: '웹 버전은 로그인 상태 유지를 위한 최소한의 브라우저 저장소만 사용하며, 광고·추적 목적의 쿠키는 사용하지 않습니다.',
    },
    {
      heading: '10. 아동의 개인정보',
      body: '이 서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 이를 알면서 아동의 개인정보를 수집하지 않습니다.',
    },
    {
      heading: '11. 개인정보 보호책임자',
      body: `이름: DAY 개발자\n이메일: ${PRIVACY_POLICY_CONTACT_EMAIL}\n\n개인정보와 관련한 문의, 불만 처리, 피해 구제를 위 연락처로 접수하면 신속히 답변드립니다.`,
    },
    {
      heading: '12. 개인정보처리방침의 변경',
      body: '이 방침은 법령이나 서비스 내용 변경에 따라 개정될 수 있으며, 변경 시 시행일과 변경 내용을 서비스 내에 공지합니다.',
    },
  ],
};

const en: PrivacyPolicyContent = {
  title: 'DAY Privacy Policy',
  effectiveDateLabel: 'Effective date: November 11, 2026',
  intro:
    'The developer of DAY (the "Service") values your privacy and complies with applicable data protection laws, including South Korea\'s Personal Information Protection Act (PIPA). This Privacy Policy explains what personal information the Service collects, how it is used and stored, and what rights you have over it.',
  sections: [
    {
      heading: '1. Information We Collect',
      body:
        'Required: email address, password (stored encrypted; not readable by anyone, including the developer), nickname\nOptional: profile photo\n\nIf you sign in with Google or Kakao: the email, name (nickname), and profile photo from that account — only the information you consent to share during sign-in.\n\nInformation created as you use the Service: posts you write (title, body text, photos, mood tag, visibility setting, tagged friends), optional location data (GPS coordinates and place name, collected only if you turn this on while writing a post), comments, likes, your friends/friend groups/blocked users list, report content you submit, pet letters (messages and replies you exchange with friends, when they were sent, and whether they were damaged), and pet information (name, kind, personality, bond level, delivery history).\n\nAutomatically collected information: a device push token for notifications, your notification/language/theme settings, and access logs/IP address (for troubleshooting and abuse prevention).',
    },
    {
      heading: '2. Purpose of Collection and Use',
      body:
        'To confirm your intent to register, verify your email, and provide the membership-based service\nTo let you write and share posts, and to provide friend/social features\nTo send push notifications for comments, likes, friend requests, and similar activity\nTo prevent abuse, process reports, and improve service quality',
    },
    {
      heading: '3. Retention Period',
      body:
        'Personal information is deleted without delay upon account deletion, as a general rule. Immediately upon deletion, your nickname, profile photo, and email link are removed/anonymized and displayed as a "deleted user."\n\nHowever, posts and comments you wrote before deleting your account are not automatically removed, since other users\' likes and comments are tied to them — only the author label changes to "deleted user." If you want a post itself removed, please delete it yourself before deleting your account.\n\nWhere a law requires a specific retention period, information is kept for that period.',
    },
    {
      heading: '4. Outsourcing of Data Processing',
      body:
        'The Service uses the following providers to process personal information on our behalf:\n\n· Google LLC (Firebase — Authentication / Firestore / Cloud Storage / Cloud Functions / Hosting): account authentication, data storage, server-side processing, web hosting\n· Google LLC (Google Sign-In): social login\n· Kakao Corp. (Kakao Login): social login\n· Expo (push notification service): sending notifications\n\nBecause the Service runs on Google\'s global infrastructure, personal information may be stored and processed on servers located outside Korea as part of this processing.',
    },
    {
      heading: '5. Sharing with Third Parties',
      body:
        'The developer does not share your personal information with third parties beyond the processing described above, except where required by law or lawfully requested by an investigative authority through due process.',
    },
    {
      heading: '6. Your Rights',
      body:
        'You can view and edit your nickname, profile photo, and bio at any time from the "Edit Profile" screen in the app, and you can request deletion by deleting your account.\n\nFor any other request to access, correct, delete, or restrict processing of your personal information, please contact us using the details below. We will act without delay after verifying your identity.',
    },
    {
      heading: '7. Destruction Procedure and Method',
      body:
        'Personal information stored electronically is permanently deleted using methods that prevent recovery. When a reason for destruction arises (account deletion, expiry of the retention period, etc.), it is destroyed without delay.',
    },
    {
      heading: '8. Security Measures',
      body:
        'We rely on Google Firebase\'s security infrastructure (encryption in transit via HTTPS/TLS, encryption at rest).\nFirestore security rules restrict access so that only you, or users covered by a post\'s visibility setting, can read the underlying data.\nPasswords are encrypted by Firebase Authentication and cannot be viewed even by the developer.\nOriginal photo files are never given public URLs; the server checks the post\'s visibility at the moment of each request before sending photo data.',
    },
    {
      heading: '9. Cookies and Similar Technologies',
      body: 'The web version uses only the minimal browser storage needed to keep you signed in. We do not use cookies for advertising or tracking.',
    },
    {
      heading: '10. Children\'s Privacy',
      body: 'This Service is not directed at children under the age of 14, and we do not knowingly collect personal information from children under 14.',
    },
    {
      heading: '11. Data Protection Contact',
      body: `Name: DAY Developer\nEmail: ${PRIVACY_POLICY_CONTACT_EMAIL}\n\nPlease send any privacy-related questions, complaints, or requests for redress to this address, and we will respond promptly.`,
    },
    {
      heading: '12. Changes to This Policy',
      body: 'This policy may be revised to reflect changes in law or in the Service. When it changes, we will announce the effective date and the changes within the Service.',
    },
  ],
};

export const privacyPolicy: Record<'ko' | 'en', PrivacyPolicyContent> = { ko, en };
