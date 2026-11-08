/**
 * 快速文法 — 英文句子的組成 (from Ryan's 英文基本觀念 handout).
 *
 * Text supports **bold**. A sentence is either plain `en` or `segs`: chunks shown
 * underlined, with an optional grammar role under each and `del` for words that
 * get dropped (shown struck through).
 */

export interface Seg {
  t: string;
  role?: string;
  del?: boolean;
}

export interface Example {
  en?: string;
  segs?: Seg[];
  /** Chinese meaning */
  zh?: string;
  /** Small grey aside, e.g. (簡單現在式) */
  tag?: string;
  /** Shown as the result of the line above (→) */
  arrow?: boolean;
}

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string; warn?: boolean }
  | { kind: 'rule'; title?: string; lines: string[] }
  | { kind: 'examples'; label?: string; items: Example[] }
  | { kind: 'table'; caption?: string; head: string[]; rows: string[][] }
  | { kind: 'note'; text: string; examples?: string[] }
  | { kind: 'transform'; items: { from: string; fromTag: string; to: string; toTag: string }[] };

export interface GrammarTopic {
  id: string;
  title: string;
  /** One-line summary for the topic list */
  summary: string;
  blocks: Block[];
}

const S = (t: string, role?: string): Seg => ({ t, role });
const D = (t: string): Seg => ({ t, del: true });

export const GRAMMAR_TOPICS: GrammarTopic[] = [
  {
    id: 'sentence',
    title: '英文句子的組成',
    summary: '主詞 ＋ 動詞 ＋ 受詞／補語',
    blocks: [
      { kind: 'p', text: '英文句子的結構基本上和中文差不多，都是由 **一個［主詞］＋ 一個［動詞］＋［受詞／補語］** 所組成，而［受詞／補語］則依［動詞］的意思來決定需不需存在。' },
      {
        kind: 'examples', label: '例 1', items: [
          { segs: [S('I', '主詞 S'), S('am', '動詞 V'), S('a student', '補語 C')], zh: '我 是 一個學生。' },
        ],
      },
      {
        kind: 'examples', label: '例 2', items: [
          { segs: [S('I', '主詞 S'), S('have', '動詞 V'), S('a pen', '受詞 O')], zh: '我 有 一支筆。' },
        ],
      },
      {
        kind: 'examples', label: '例 3', items: [
          { segs: [S('I', '主詞 S'), S('dance', '動詞 V')], zh: '我 跳舞。' },
        ],
      },
      { kind: 'note', text: 'dance 意思是跳舞，後面不需要再加其他東西去補足整句的意思，這時就不需要［受詞／補語］。' },
      { kind: 'note', text: '主詞其實就是一個名詞，任何可以當名詞的東西都可以當主詞。' },
      {
        kind: 'table', head: ['縮寫', '英文', '中文'], rows: [
          ['S', 'Subject', '主詞'],
          ['V', 'Verb', '動詞'],
          ['O', 'Object', '受詞'],
          ['C', 'Complement', '補語'],
        ],
      },
    ],
  },
  {
    id: 'be-verb',
    title: 'BE 動詞是啥？',
    summary: '是… ＋ 名詞、很… ＋ 形容詞',
    blocks: [
      { kind: 'p', text: '常常聽到看到 BE（ㄅㄧ）動詞，BE 動詞到底是什麼？BE 動詞是最常看到的［動詞］，但是它的變化很多（原始型態是 be，所以統稱 be 動詞），用法也比其他動詞複雜一點，不過常見的用法就那幾種而已。' },
      { kind: 'p', text: '英文的**動詞會依照主詞是第幾人稱來變化**，大部分都是動詞後面加或不加 s 或 es，但是有些動詞變化是不規則的，BE 動詞就是其一。' },
      { kind: 'rule', title: 'Be 動詞當動詞時，最常見的意思：', lines: ['是… ＋ 名詞', '很… ＋ 形容詞'] },
      {
        kind: 'examples', label: '例 1（是）', items: [
          { segs: [S('I'), S('am'), S('a student')] },
          { segs: [S('You'), S('are'), S('a doctor')] },
          { segs: [S('She/He'), S('is'), S('a pig')] },
        ],
      },
      {
        kind: 'examples', label: '例 2（很）', items: [
          { segs: [S('I'), S('am'), S('smart')] },
          { segs: [S('You'), S('are'), S('tall')] },
          { segs: [S('She/He'), S('is'), S('young')] },
        ],
      },
      {
        kind: 'table', head: ['人稱', 'Be 動詞（現在式）', 'Be 動詞（過去式）'], rows: [
          ['I（第 1）', 'am', 'was'],
          ['You（第 2）', 'are', 'were'],
          ['He（第 3）', 'is', 'was'],
          ['She（第 3）', 'is', 'was'],
          ['They（第 3）', 'are', 'were'],
          ['A dog（第 3）', 'is', 'was'],
        ],
      },
    ],
  },
  {
    id: 'progressive-passive',
    title: 'BE 動詞用來形成進行式／被動式',
    summary: 'be ＋ ing、be ＋ p.p.',
    blocks: [
      { kind: 'p', text: 'Be 動詞另外一個常見的用法是在後面放另一個動詞的 **ING 型態**來形成**進行式**，或是在後面放另一個動詞的**過去分詞型態**（俗稱 p.p.，通常是動詞＋ed）來形成**被動式**。' },
      {
        kind: 'examples', label: '例 1（進行式）', items: [
          { en: 'I dance.', tag: '簡單現在式' },
          { en: 'I danc**ed**.', tag: '簡單過去式' },
          { en: 'I am danc**ing**.', tag: '現在進行式' },
          { en: 'I was danc**ing**.', tag: '過去進行式' },
          { en: 'He is read**ing** a book.' },
          { en: 'They were do**ing** something.' },
        ],
      },
      {
        kind: 'examples', label: '例 2（被動式）', items: [
          { en: 'She kills me.', tag: '簡單現在式' },
          { en: 'She kill**ed** me.', tag: '簡單過去式' },
          { en: 'I am kill**ed** by her.', tag: '被動式' },
          { en: 'I was kill**ed** by her.', tag: '被動式（過去）' },
        ],
      },
      { kind: 'note', text: 'by her 是介係詞片語，當作副詞用，可有可無，只是用來補充句子的意思。' },
    ],
  },
  {
    id: 'base-form',
    title: 'BE 動詞什麼時候恢復原形？',
    summary: '助動詞後面接動詞原形',
    blocks: [
      { kind: 'p', text: 'Be 動詞和其他英文動詞的**原形**大多出現**在助動詞後面**，因大部分的助動詞後面只能接動詞原形！助動詞顧名思義就是用來補充動詞的意思。而有助動詞出現時，**句子的時態只要用助動詞來變就可以**，後面的動詞一樣維持原形。' },
      {
        kind: 'examples', label: '例 1', items: [
          { en: 'They are students.', zh: '他們**是**學生' },
          { en: 'They will be students.', zh: '他們**將會是**學生' },
          { en: 'She loved cats.', zh: '她以前**愛**貓咪' },
          { en: 'She did not love cats.', zh: '她以前**不愛**貓咪' },
        ],
      },
      {
        kind: 'table', caption: '常見的助動詞', head: ['助動詞（現在式）', '助動詞（過去式）', '意思'], rows: [
          ['can', 'could', '可以'],
          ['will', 'would', '將會'],
          ['shall', 'should', '應該'],
          ['may', 'might', '可能會'],
          ['must', '無過去式', '必須'],
          ['do/does + not', 'did + not', '把意思變否定'],
        ],
      },
      {
        kind: 'note',
        text: 'do/does 可當動詞也可當助動詞，當動詞時意思是：做…\ndo/does 當助動詞 ＋ not 時，純粹是把原本動詞的意思變否定。而 do/does 當助動詞時也要依人稱變化。',
        examples: ['I do something.', 'He does something.'],
      },
    ],
  },
  {
    id: 'past-participle',
    title: 'p.p.（過去分詞）？',
    summary: '動詞三態、被動式與完成式',
    blocks: [
      { kind: 'p', text: '英文和中文不同的是，動詞會依據時態來變化，一個動詞有三種型態：' },
      { kind: 'rule', lines: ['現在式（present） — 過去式（past） — 過去分詞（past participle）'] },
      { kind: 'p', text: '現在式和過去式非常簡單，只是單純用來表示動作發生在現在或是過去，而**過去分詞主要有兩種用法**：' },
      { kind: 'h', text: '1. 前面放 Be 動詞形成被動式' },
      {
        kind: 'examples', items: [
          { en: 'He is killed.', tag: 'kill 三態：kill　killed　killed' },
          { en: 'They are seen.', tag: 'see　saw　seen' },
          { en: 'We were cheated.', tag: 'cheat　cheated　cheated' },
        ],
      },
      { kind: 'h', text: '2. 前面放 Have 形成完成式' },
      { kind: 'p', text: '此時 have 為助動詞，要依據人稱變化。' },
      {
        kind: 'examples', items: [
          { en: 'I have done my job.', tag: 'do　did　done', zh: '我**已經**做了我的工作' },
          { en: 'He has died.', tag: 'die　died　died', zh: '他**已經**死了' },
        ],
      },
      {
        kind: 'table', head: ['人稱', 'Have（現在式）', 'Have（過去式）'], rows: [
          ['第 1 & 2', 'have', 'had'],
          ['第 3', 'has', 'had'],
        ],
      },
      { kind: 'p', text: '**完成式**主要用來表示已經發生過的事情，**什麼時候發生的並不重要**，而**過去式**通常會和時間副詞一起出現，**強調是某個時間點發生的事情**。' },
      { kind: 'p', text: '完成式也有被動式，表示已經被…，此時要用 **have ＋ been ＋ 動詞 p.p.**' },
      {
        kind: 'examples', items: [
          { en: 'He has been killed.', zh: '他已經被殺了' },
          { en: 'We have been bitten.', zh: '我們已經被咬了' },
        ],
      },
      { kind: 'note', text: 'be 動詞的過去分詞就是 **been**。' },
      { kind: 'p', text: '注意：Have 本身也可以當作一般動詞，意思是**有**，**所以看到兩個 have 一起出現時，前面的 have 就是助動詞，用來形成完成式**。' },
      {
        kind: 'examples', items: [
          { en: 'She **has** had a dog.' },
          { en: 'We **have** had a good time.' },
        ],
      },
    ],
  },
  {
    id: 'subject',
    title: '哪些東西可以當主詞？',
    summary: '名詞、that 子句、問句變名詞',
    blocks: [
      { kind: 'p', text: '讀英文句子時，最重要的是要找出**主詞**和**主要動詞**，**主詞**就是一個句子中最重要的**名詞**，而**主要動詞**就是**主詞**做出的動作，**一個句子通常只會有一個主詞和一個主要動詞**，其他有的沒的介系詞片語／副詞／子句等都是補充意思用的，相對沒那麼重要。' },
      { kind: 'p', text: '一般常看到的主詞如 Peter, Mary, you, a dog, school…等等，**只要是名詞就可以拿來當主詞。**' },
      {
        kind: 'examples', items: [
          { en: 'Peter is good.' },
          { en: 'Mary is bad.' },
          { en: 'You make me angry.' },
        ],
      },
      { kind: 'h', text: '但如果想用句子當主詞時怎麼辦？' },
      { kind: 'p', text: '**只要在句子前面 ＋ 一個 that 就可以把句子變成名詞！（俗稱 that 子句）**' },
      {
        kind: 'examples', items: [
          { segs: [S('That Mary is bad', '主詞'), S('is', '動詞'), S('cool', '補語')], zh: '瑪莉很壞［整件事］ 很 酷' },
        ],
      },
      { kind: 'h', text: '問句變化方法' },
      {
        kind: 'transform', items: [
          { from: 'Is he a good boy?', fromTag: '句子', to: 'Whether he is a good boy', toTag: '名詞' },
          { from: 'Where can we find him?', fromTag: '句子', to: 'Where we can find him', toTag: '名詞' },
          { from: 'What did you want?', fromTag: '句子', to: 'What you wanted', toTag: '名詞' },
          { from: 'When will she come?', fromTag: '句子', to: 'When she will come', toTag: '名詞' },
          { from: 'How are you doing?', fromTag: '句子', to: 'How you are doing', toTag: '名詞' },
          { from: 'Who killed you?', fromTag: '句子', to: 'Who killed you', toTag: '名詞' },
        ],
      },
      { kind: 'p', text: '由於英文裡的主詞不喜歡搞得太長，使用這類句子變成的名詞當主詞時，常常會用 It 來代替，並把原本的主詞丟到後面：' },
      {
        kind: 'examples', items: [
          { segs: [S('That Mary is bad'), S('is'), S('cool')] },
          { segs: [S('It'), S('is'), S('cool'), S('that Mary is bad')], tag: 'It = that Mary is bad', arrow: true },
        ],
      },
      {
        kind: 'examples', items: [
          { segs: [S('Whether he is a good boy'), S('is'), S('a secret')] },
          { segs: [S('It'), S('is'), S('a secret'), S('whether he is a good boy')], tag: 'It = whether he is a good boy', arrow: true },
        ],
      },
    ],
  },
  {
    id: 'verb-as-noun',
    title: '動詞變名詞：to 與 ing',
    summary: 'To study hard is good.',
    blocks: [
      { kind: 'p', text: '句子可以變名詞，動詞當然也可以，動詞變名詞的方式有兩種：' },
      { kind: 'note', text: '句子或動詞變名詞後都視為**單數**。' },
      { kind: 'h', text: '1. 動詞前面 ＋ to' },
      { kind: 'transform', items: [{ from: 'study hard', fromTag: '動詞', to: 'To study hard', toTag: '名詞' }] },
      {
        kind: 'examples', items: [
          { segs: [S('To study hard', '主詞'), S('is', '動詞'), S('good', '受詞 or 補語')] },
          { segs: [S('To be with you', '主詞'), S('is', '動詞'), S('my dream', '受詞 or 補語')] },
          { segs: [S('To hurt you', '主詞'), S('makes', '動詞'), S('me feel good', '受詞 or 補語')] },
        ],
      },
      { kind: 'h', text: '2. 動詞後面 ＋ ing' },
      { kind: 'transform', items: [{ from: 'love you', fromTag: '動詞', to: 'loving you', toTag: '名詞' }] },
      {
        kind: 'examples', items: [
          { segs: [S('Loving you', '主詞'), S('is', '動詞'), S('disgusting', '受詞 or 補語')] },
          { segs: [S('Raining', '主詞'), S('is', '動詞'), S('great', '受詞 or 補語')] },
          { segs: [S('Being good', '主詞'), S('makes', '動詞'), S('my mom happy', '受詞 or 補語')] },
        ],
      },
      { kind: 'note', text: 'to 通常表示還沒做過的事，而 ing 通常表示已經做過的事。' },
      { kind: 'p', text: '和句子變成名詞時一樣，經常會使用 It 來代替，並把原本的東西丟到後面，而這時候後面通常全部都改為 To 的型態：' },
      {
        kind: 'examples', items: [
          { segs: [S('To study hard'), S('is'), S('good')] },
          { segs: [S('It'), S('is'), S('good'), S('to study hard')], tag: 'It = to study hard', arrow: true },
        ],
      },
      {
        kind: 'examples', items: [
          { segs: [S('Loving you'), S('is'), S('disgusting')] },
          { segs: [S('It'), S('is'), S('disgusting'), S('to love you')], tag: 'It = loving you／to love you', arrow: true },
        ],
      },
    ],
  },
  {
    id: 'object',
    title: '哪些東西可以當受詞？',
    summary: 'that 子句當受詞，that 可以省略',
    blocks: [
      { kind: 'p', text: '當受詞的條件和主詞一樣，只要是名詞基本上都可以當受詞。' },
      {
        kind: 'examples', items: [
          { segs: [S('I', '主詞'), S('believe', '動詞'), S('that Mary is a good girl', '受詞')], zh: '我 相信 瑪莉是個好女孩' },
          { segs: [S('I', '主詞'), S("don't know", '動詞'), S('where we can find him', '受詞')], zh: '我 不知道 我們哪裡可以找到他' },
          { segs: [S('He', '主詞'), S('wants', '動詞'), S('to find me', '受詞')], zh: '他 想要 找到我' },
          { segs: [S('We', '主詞'), S('enjoy', '動詞'), S('playing games', '受詞')], zh: '我們 喜歡 玩遊戲' },
        ],
      },
      { kind: 'h', text: '注意！That 子句當受詞時，That 可以省略：', warn: true },
      {
        kind: 'examples', items: [
          { en: 'I believe that Mary likes Peter.', zh: '我 相信 瑪莉喜歡彼得' },
          { en: 'We know that Teddy loves to kick Ryan.', zh: '我們 知道 Teddy 喜歡踢 Ryan' },
          { en: 'I believe Mary likes Peter.', tag: '省略 that', arrow: true },
          { en: 'We know Teddy loves to kick Ryan.', tag: '省略 that', arrow: true },
        ],
      },
      { kind: 'p', text: '**這時如果不知道是有 that 被省略掉的話，會搞不清楚句子的意思，到底是「我 相信 瑪莉」，還是「我 相信 瑪莉喜歡彼得」？**' },
      { kind: 'p', text: '還好…**會使用 that 子句當受詞的動詞都是 think／believe／know 等這類和知覺／想法有關的動詞**，後面通常都要接**一件事**當受詞，如搞不清楚狀況時，趕快看看前面有沒有這類動詞，然後試著把後面一整句話當成一件事，做為這些動詞的受詞，就能馬上翻出通順的句意！' },
    ],
  },
  {
    id: 'adjective-clause',
    title: '形容詞子句',
    summary: 'who／which／that 與省略規則',
    blocks: [
      { kind: 'p', text: '形容詞子句和前面提到的 That 子句一樣容易讓人搞混，但只要先記住他的功能是什麼就很好理解。形容詞子句顧名思義就只是用來**當形容詞的句子**，他修飾的是前面的**名詞**，**搞不清楚的時候，把整句翻譯出來，再加一個（的）再加上前面的名詞**，意思如通順就沒錯。' },
      { kind: 'p', text: '形容詞子句開頭都會用一個**關係代名詞**，就是用來代替前面出現的名詞而已，**是人就用 who，不是人就用 which**，而還有一個 **that 是人狗物都通用**。' },
      {
        kind: 'examples', items: [
          { segs: [S('I', '主詞'), S('had', '動詞'), S('a dog', '受詞'), S('which I bought', '形容詞子句'), S('in a pet store', '介詞當副詞')], zh: '我有一隻 我在寵物店買**（的）**狗' },
        ],
      },
      { kind: 'p', text: '這句話的意思就是我有一隻狗，這狗是我在寵物店買**（的）**狗。其中 which 代替的就是 a dog，做為 bought 的受詞，等於 I had a dog (a dog) I bought in a pet store.' },
      { kind: 'p', text: '奇怪一般句子不是應該要寫成 I had a dog (I bought a dog)，a dog 不是應該要放在 bought 後面才對嗎？沒辦法～形容詞子句的規則就是這樣，代替的名詞（which／who／that）**一定要放在最前面，即使是當受詞也一樣**。' },
      {
        kind: 'examples', items: [
          { en: 'I saw a person that I hate.', zh: '我看到一個我討厭的人', tag: 'that 代替 a person，做 hate 的受詞' },
          { en: 'I bought a toy which I am interested in.', zh: '我買了一個我有興趣的玩具', tag: 'which 代替 a toy，做 in 的受詞' },
        ],
      },
      { kind: 'h', text: '注意！形容詞子句開頭的（who／which／that）當受詞時，可以省略：', warn: true },
      {
        kind: 'examples', items: [
          { en: 'I saw a person I hate.', zh: '我看到一個我討厭的人', tag: '省略 that 或 who/whom' },
          { en: 'I bought a toy I am interested in.', zh: '我買了一個我有興趣的玩具', tag: '省略 that 或 which' },
        ],
      },
      { kind: 'p', text: '形容詞子句的開頭 which／who／that，除可以當受詞外，也可以當主詞，當主詞時順序就和一般句子沒兩樣：' },
      {
        kind: 'examples', items: [
          { segs: [S('I', '主詞'), S('saw', '動詞'), S('the dog', '受詞'), S('that bit me', '形容詞子句')], zh: '我 看到 一隻咬過我的 狗', tag: 'that 代替 the dog' },
          { segs: [S('I', '主詞'), S('know', '動詞'), S('a person', '受詞'), S('who is always running', '形容詞子句')], zh: '我 知道 一個總是在跑步的 人', tag: 'who 代替 a person' },
          { segs: [S('A cat', '主詞'), S('that is very angry', '形容詞子句'), S('will bite', '動詞'), S('me', '受詞')], zh: '一隻 非常生氣的 貓 會咬我', tag: 'that 代替 a cat' },
        ],
      },
      { kind: 'h', text: '注意！形容詞子句開頭的（who／which／that）當主詞時，也可以省略，規則如下：', warn: true },
      { kind: 'p', text: '如果是**主動語態**，去掉 who／which／that，然後把動詞變 ing，如有 be 動詞也一起省略。' },
      {
        kind: 'examples', items: [
          { segs: [S('I'), S('know'), S('a person'), D('who is'), S('always running')] },
          { segs: [S('I'), S('know'), S('a person'), S('always running')], zh: '我 認識 一個總是在跑步的 人', arrow: true },
        ],
      },
      {
        kind: 'examples', items: [
          { segs: [S('A cat'), D('that is'), S('very angry'), S('will bite'), S('me')] },
          { segs: [S('A cat'), S('very angry'), S('will bite'), S('me')], zh: '一隻 非常生氣的 貓 會咬我', arrow: true },
        ],
      },
      {
        kind: 'examples', items: [
          { segs: [S('The man'), D('that'), S('enjoys killing people'), S('is'), S('bad')] },
          { segs: [S('The man'), S('enjoying killing people'), S('is'), S('bad')], zh: '喜歡殺人的 男人 很不好', arrow: true },
        ],
      },
      { kind: 'p', text: '如果是**被動語態**，去掉 who／which／that 和 be 動詞，保留過去分詞。' },
      {
        kind: 'examples', items: [
          { segs: [S('I'), S('know'), S('the girl'), D('who is'), S('fired')] },
          { segs: [S('I'), S('know'), S('the girl'), S('fired')], zh: '我 知道 那個被炒魷魚的 女孩', arrow: true },
        ],
      },
      {
        kind: 'examples', items: [
          { segs: [S('A cat'), D('that was'), S('fed'), S('will sleep now')] },
          { segs: [S('A cat'), S('fed'), S('will sleep now')], zh: '一隻 被餵過的 貓 現在要睡覺', arrow: true },
        ],
      },
      { kind: 'p', text: '如果是**完成式語態**，去掉 who／which／that，把 have／has 變 ing，保留過去分詞。' },
      {
        kind: 'examples', items: [
          { segs: [S('A girl'), D('who has'), S('forgotten me'), S('will not love me again')] },
          { segs: [S('A girl'), S('having forgotten me'), S('will not love me again')], zh: '一個 已經忘了我的 女孩 不會再愛我了', arrow: true },
        ],
      },
    ],
  },
  {
    id: 'reading',
    title: '閱讀的技巧',
    summary: '先找主詞、主要動詞、受詞',
    blocks: [
      { kind: 'p', text: '有了上述的概念後，在讀文章時，就可以先分清楚句中**最重要的人或物是誰（主詞）**，而這個**主詞做了什麼動作（主要動詞）**，動作的**對象又是誰（受詞）**，其他介係詞（in／on／with／after…等）開頭的片語都是補充意思的，可以先不看。' },
      { kind: 'p', text: '在句子中間又看到一個句子時怎麼辦，搞不清楚狀況，這時候趕快看看句子中間的句子**前面**有沒有 **think／believe／know 等這類和知覺／想法有關的動詞，有的話後面的句子八成就是 that 子句在當他們的受詞。**' },
      { kind: 'p', text: '如果沒有，**前面有的是名詞，那後面的句子八成是形容詞子句，趕快把意思翻譯出來加個（的）再加上前面的名詞，如果句意通順就沒錯了！**' },
      { kind: 'examples', items: [{ en: 'In 1991, a boy many people loved knew he was going to be a super star.' }] },
      { kind: 'p', text: '這個句子看似複雜，many people loved 插在中間不知道幹麻，後面還有一句 he was going to be a super star，到底是怎樣，搞不清楚，別怕，many people loved 看起來像句子，那看看前面有沒有 think／believe／know 之類的動詞或名詞，發現前面只有 a boy，是個名詞，那八成這句是形容詞子句，而後面的 he was going to be a super star 又是一個句子，哎呀前面果然有一個 knew，那這句八成是 that 子句當 knew 的受詞。' },
      { kind: 'p', text: '這樣就可以輕鬆翻譯出來囉：' },
      {
        kind: 'examples', items: [
          {
            segs: [S('In 1991,', '副詞'), S('a boy', '主詞'), S('many people loved', '形容詞子句'), S('knew', '動詞'), S('he was going to be a super star', '受詞（that 子句）')],
            zh: '在 1991 年，一個 許多人愛（的） 男孩 知道 他將來會變成大明星',
          },
        ],
      },
    ],
  },
];
