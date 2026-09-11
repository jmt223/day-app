/**
 * 이용약관 — privacy-policy.ts와 같은 이유로 translations.ts와 분리해서 둔다
 * (길고, 조항 단위로 따로 검토·수정하는 게 잦은 법적 문서).
 */

export type TermsSection = {
  heading: string;
  body: string;
};

export type TermsContent = {
  title: string;
  effectiveDateLabel: string;
  intro: string;
  sections: TermsSection[];
};

export const TERMS_EFFECTIVE_DATE = '2026-09-07';

const ko: TermsContent = {
  title: 'DAY 이용약관',
  effectiveDateLabel: '시행일: 2026년 9월 7일',
  intro:
    '이 약관은 DAY(이하 "서비스")를 만든 개발자(이하 "개발자")와 이용자 사이의 서비스 이용에 관한 조건과 절차, 권리와 의무를 정합니다. 서비스에 가입하면 이 약관에 동의한 것으로 봅니다.',
  sections: [
    {
      heading: '1. 목적',
      body: '이 약관은 서비스 이용과 관련하여 개발자와 이용자 간의 권리, 의무 및 책임사항, 이용 절차 등 기본적인 사항을 규정함을 목적으로 합니다.',
    },
    {
      heading: '2. 서비스의 내용',
      body:
        '서비스는 이용자가 하루하루의 기록(이하 "DAY")을 글과 사진으로 작성하고, 공개범위(전체공개/친구공개/그룹공개/비공개)를 선택해 다른 이용자와 공유할 수 있는 개인 기록 서비스입니다.\n\n이용자는 다른 이용자를 친구로 추가하고, 서로의 DAY에 댓글·좋아요를 남기고, DAY 작성 시 함께한 친구를 태그할 수 있습니다.',
    },
    {
      heading: '3. 약관의 효력 및 변경',
      body:
        '이 약관은 서비스 내 게시함으로써 효력이 발생합니다. 개발자는 관계 법령을 위반하지 않는 범위에서 이 약관을 개정할 수 있으며, 개정 시 시행일과 변경 내용을 서비스 내에 공지합니다.\n\n이용자가 개정약관 시행일 이후에도 서비스를 계속 이용하면 개정약관에 동의한 것으로 봅니다.',
    },
    {
      heading: '4. 회원가입',
      body:
        '이용자는 이메일/비밀번호 또는 구글·카카오 계정으로 가입할 수 있습니다. 이메일로 가입한 경우, 이메일 인증을 완료해야 게시물 작성 등 일부 기능을 이용할 수 있습니다.\n\n타인의 명의나 정보를 도용하거나, 허위 정보를 기재해서는 안 됩니다.',
    },
    {
      heading: '5. 이용자의 의무 (금지행위)',
      body:
        '이용자는 다음 행위를 해서는 안 됩니다.\n\n· 타인의 명의·닉네임·사진을 도용하거나 사칭하는 행위\n· 다른 이용자를 비방·모욕하거나 명예를 훼손하는 게시물·댓글을 남기는 행위\n· 음란물, 폭력적 콘텐츠 등 관계 법령이 금지하는 정보를 게시하는 행위\n· 타인의 저작권 등 지식재산권을 침해하는 콘텐츠를 게시하는 행위\n· 서비스를 이용해 스팸, 광고, 도배성 게시물을 남기거나 좋아요·댓글·알림 기능을 부정한 방법으로 조작하는 행위\n· 자동화된 수단(봇 등)으로 서비스에 비정상적으로 접근하는 행위\n· 그 밖에 관계 법령에 위반되거나 서비스 운영을 방해하는 행위',
    },
    {
      heading: '6. 게시물의 저작권과 이용',
      body:
        '이용자가 작성한 DAY, 댓글 등 게시물의 저작권은 그 이용자 본인에게 있습니다.\n\n다만 이용자는 자신이 선택한 공개범위 안에서 게시물이 다른 이용자에게 노출·전송되는 것에 동의하며, 개발자는 서비스 제공(저장, 전송, 화면 표시 등)에 필요한 범위 안에서만 게시물을 이용합니다. 개발자는 이용자의 게시물을 서비스 제공 목적 외의 용도(예: 광고 소재)로 사용하지 않습니다.',
    },
    {
      heading: '7. 게시물의 관리',
      body:
        '이용자의 게시물이 위 5조(금지행위)를 위반하거나 다른 이용자로부터 신고된 경우, 개발자는 관계 법령 및 이 약관에 따라 해당 게시물을 삭제하거나 게시 중단을 요청할 수 있습니다.\n\n이용자는 자신이 작성한 게시물을 언제든 직접 삭제할 수 있습니다(작성 후 24시간이 지나면 내용 수정은 제한되지만, 삭제는 항상 가능합니다).',
    },
    {
      heading: '8. 서비스 이용 제한',
      body:
        '이용자가 5조를 위반하거나 다른 이용자에게 피해를 주는 경우, 개발자는 사전 통지 없이 해당 이용자의 서비스 이용을 제한하거나 계정을 정지할 수 있습니다.',
    },
    {
      heading: '9. 회원 탈퇴',
      body:
        '이용자는 언제든지 앱 내 회원 탈퇴 기능으로 서비스 이용을 중단할 수 있습니다. 탈퇴 시 개인정보 처리에 관한 사항은 개인정보처리방침을 따릅니다.',
    },
    {
      heading: '10. 서비스의 변경 및 중단',
      body:
        '개발자는 서비스의 전부 또는 일부를 개선·변경할 수 있으며, 운영상·기술상 필요에 따라 서비스 제공을 일시적으로 중단하거나 종료할 수 있습니다. 서비스를 종료하는 경우 사전에 서비스 내에 공지합니다.',
    },
    {
      heading: '11. 면책조항',
      body:
        '개발자는 천재지변, 불가항력적 사유로 서비스를 제공할 수 없는 경우 책임을 지지 않습니다.\n\n개발자는 이용자가 서비스에 게시한 정보·자료의 신뢰도, 정확성에 대해 책임을 지지 않으며, 이용자 상호 간 또는 이용자와 제3자 간에 서비스를 매개로 발생한 분쟁에 대해 개입할 의무가 없습니다.',
    },
    {
      heading: '12. 준거법 및 재판관할',
      body: '이 약관은 대한민국 법령에 따라 해석되며, 서비스 이용과 관련하여 분쟁이 발생한 경우 민사소송법상의 관할법원에 제기합니다.',
    },
  ],
};

const en: TermsContent = {
  title: 'DAY Terms of Service',
  effectiveDateLabel: 'Effective date: September 7, 2026',
  intro:
    'These Terms govern the conditions, procedures, and rights and obligations between the developer of DAY (the "Service") and users. Registering for the Service constitutes agreement to these Terms.',
  sections: [
    {
      heading: '1. Purpose',
      body: 'These Terms set out the basic rights, obligations, responsibilities, and procedures between the developer and users in connection with use of the Service.',
    },
    {
      heading: '2. Description of the Service',
      body:
        'The Service lets users write daily entries ("DAY") combining text and photos, and share them with others by choosing a visibility level (public, friends, a specific group, or private).\n\nUsers can add other users as friends, leave comments and likes on each other\'s DAY entries, and tag friends who were part of a given day.',
    },
    {
      heading: '3. Effect and Amendment of the Terms',
      body:
        'These Terms take effect once posted within the Service. The developer may amend these Terms within the bounds of applicable law, announcing the effective date and the changes within the Service.\n\nContinuing to use the Service after amended Terms take effect constitutes agreement to the amended Terms.',
    },
    {
      heading: '4. Registration',
      body:
        'Users may register with an email and password, or with a Google or Kakao account. Email accounts must complete email verification before using certain features, such as posting.\n\nUsers must not impersonate another person, use another person\'s information, or provide false information.',
    },
    {
      heading: '5. User Obligations (Prohibited Conduct)',
      body:
        'Users must not:\n\n· Impersonate another person or use their name, nickname, or photo without authorization\n· Post content or comments that defame, insult, or harass other users\n· Post obscene, violent, or otherwise unlawful content\n· Post content that infringes another party\'s copyright or other intellectual property\n· Use the Service to post spam, advertising, or repetitive content, or manipulate likes, comments, or notifications through improper means\n· Access the Service through automated means (bots, etc.) in an abnormal manner\n· Otherwise violate applicable law or interfere with the operation of the Service',
    },
    {
      heading: '6. Ownership and Use of Content',
      body:
        'Users retain copyright in the DAY entries, comments, and other content they create.\n\nBy posting content, a user agrees that it will be shown to other users within the visibility scope they chose, and the developer uses that content only to the extent necessary to provide the Service (storage, transmission, display, etc.). The developer does not use user content for purposes outside providing the Service, such as advertising material.',
    },
    {
      heading: '7. Content Management',
      body:
        'If a user\'s content violates Section 5 or is reported by another user, the developer may remove it or request that it be taken down, in accordance with applicable law and these Terms.\n\nUsers may delete their own content at any time (editing is limited to within 24 hours of posting, but deletion is always available).',
    },
    {
      heading: '8. Restriction of Service Use',
      body: 'If a user violates Section 5 or harms other users, the developer may restrict that user\'s access to the Service or suspend their account without prior notice.',
    },
    {
      heading: '9. Account Deletion',
      body: 'Users may stop using the Service at any time via the in-app account deletion feature. Handling of personal information upon deletion follows the Privacy Policy.',
    },
    {
      heading: '10. Changes to and Suspension of the Service',
      body:
        'The developer may improve or change all or part of the Service, and may temporarily suspend or discontinue it for operational or technical reasons. Users will be notified within the Service in advance of any discontinuation.',
    },
    {
      heading: '11. Disclaimer',
      body:
        'The developer is not liable for failing to provide the Service due to natural disasters or other events beyond its reasonable control.\n\nThe developer is not responsible for the reliability or accuracy of information users post, and has no obligation to intervene in disputes between users, or between a user and a third party, arising in connection with the Service.',
    },
    {
      heading: '12. Governing Law and Jurisdiction',
      body: 'These Terms are governed by the laws of the Republic of Korea. Any dispute arising from use of the Service is subject to the competent court under the Civil Procedure Act.',
    },
  ],
};

export const terms: Record<'ko' | 'en', TermsContent> = { ko, en };
