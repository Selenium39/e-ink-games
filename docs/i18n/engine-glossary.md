# 引擎 UI 词表术语对照表(engine glossary)

10 款游戏引擎词表(words.en.ts 键)中跨游戏复用的高频词统一译法。
**Wave B(ui-words.json 翻译)必须原样引用本表值**,不得另译;单游戏特有词按语境自行翻译。
zh-TW 为"简转繁 + 台湾用语"双步产物(软件→軟體、屏幕→螢幕、储存→儲存)。

## 交互通用词

| key | en | zh | zh-TW | de | es | fr | it | pt | ja | ko | ru | nl | pl | tr | sv | ar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ok | OK | 确定 | 確定 | OK | OK | OK | OK | OK | OK | 확인 | ОК | OK | OK | Tamam | OK | موافق |
| cancel | Cancel | 取消 | 取消 | Abbrechen | Cancelar | Annuler | Annulla | Cancelar | キャンセル | 취소 | Отмена | Annuleren | Anuluj | İptal | Avbryt | إلغاء |
| confirm | Start a new game? Current progress will be lost. | 开始新游戏？当前进度将丢失。 | 開始新遊戲？目前進度將遺失。 | Neues Spiel starten? Der aktuelle Fortschritt geht verloren. | ¿Empezar una partida nueva? Se perderá el progreso actual. | Commencer une nouvelle partie ? La progression actuelle sera perdue. | Iniziare una nuova partita? Il progresso attuale andrà perso. | Começar um novo jogo? O progresso atual será perdido. | 新しいゲームを始めますか？現在の進行状況は失われます。 | 새 게임을 시작할까요? 현재 진행 상황은 사라집니다. | Начать новую игру? Текущий прогресс будет потерян. | Nieuw spel starten? De huidige voortgang gaat verloren. | Rozpocząć nową grę? Bieżący postęp zostanie utracony. | Yeni oyun başlatılsın mı? Mevcut ilerleme kaybolacak. | Starta ett nytt spel? Nuvarande framsteg går förlorade. | بدء لعبة جديدة؟ سيُفقد التقدم الحالي. |
| undo | Undo | 撤销 | 復原 | Zurück | Deshacer | Retour | Indietro | Desfazer | 元に戻す | 되돌리기 | Отменить | Ongedaan maken | Cofnij | Geri al | Ångra | تراجع |
| newGame | New Game | 新游戏 | 新遊戲 | Neues Spiel | Nueva partida | Nouvelle partie | Nuova partita | Novo jogo | 新しいゲーム | 새 게임 | Новая игра | Nieuw spel | Nowa gra | Yeni oyun | Nytt spel | لعبة جديدة |
| progressSaved | Progress is saved automatically. | 进度会自动保存。 | 進度會自動儲存。 | Der Fortschritt wird automatisch gespeichert. | El progreso se guarda automáticamente. | La progression est sauvegardée automatiquement. | I progressi vengono salvati automaticamente. | O progresso é guardado automaticamente. | 進行状況は自動的に保存されます。 | 진행 상황이 자동으로 저장됩니다. | Прогресс сохраняется автоматически. | De voortgang wordt automatisch opgeslagen. | Postęp jest zapisywany automatycznie. | İlerleme otomatik olarak kaydedilir. | Framsteget sparas automatiskt. | يتم حفظ التقدم تلقائيًا. |

## 计时 / 计分

| key | en | zh | zh-TW | de | es | fr | it | pt | ja | ko | ru | nl | pl | tr | sv | ar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| timeLabel | TIME | 用时 | 用時 | ZEIT | TIEMPO | TEMPS | TEMPO | TEMPO | 時間 | 시간 | ВРЕМЯ | TIJD | CZAS | SÜRE | TID | الوقت |
| scoreLabel | Score | 得分 | 得分 | Punkte | Puntos | Score | Punti | Pontos | スコア | 점수 | Счёт | Score | Wynik | Puan | Poäng | النقاط |
| bestLabel | Best | 最佳 | 最佳 | Bestwert | Récord | Record | Record | Recorde | ベスト | 최고 | Рекорд | Record | Rekord | Rekor | Rekord | الأفضل |
| finalScore | Final score | 最终得分 | 最終得分 | Endpunktzahl | Puntuación final | Score final | Punteggio finale | Pontuação final | 最終スコア | 최종 점수 | Итоговый счёт | Eindscore | Wynik końcowy | Son puan | Slutpoäng | النتيجة النهائية |
| movesLabel | Moves | 步数 | 步數 | Züge | Movimientos | Coups | Mosse | Jogadas | 手数 | 이동 | Ходы | Zetten | Ruchy | Hamleler | Drag | حركات |

## 终局 / 状态

| key | en | zh | zh-TW | de | es | fr | it | pt | ja | ko | ru | nl | pl | tr | sv | ar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solved | Solved! | 完成！ | 完成！ | Gelöst! | ¡Resuelto! | Résolu ! | Risolto! | Resolvido! | 完成！ | 완료! | Решено! | Opgelost! | Rozwiązane! | Çözüldü! | Löst! | تم الحل! |
| winTitle / youWin | You win! | 你赢了！ | 你贏了！ | Gewonnen! | ¡Ganas! | Gagné ! | Hai vinto! | Você ganhou! | 勝ち！ | 승리! | Победа! | Gewonnen! | Wygrywasz! | Kazandın! | Du vann! | فزت! |
| overTitle | Game over | 游戏结束 | 遊戲結束 | Spiel vorbei | Fin del juego | Partie terminée | Partita finita | Fim de jogo | ゲームオーバー | 게임 오버 | Игра окончена | Spel voorbij | Koniec gry | Oyun bitti | Spelet är slut | انتهت اللعبة |
| keepGoing | Keep going | 继续 | 繼續 | Weiterspielen | Seguir jugando | Continuer | Continua | Continuar | 続ける | 계속하기 | Продолжить | Doorgaan | Graj dalej | Devam et | Fortsätt | متابعة |
| draw | Draw! | 平局！ | 平手！ | Unentschieden! | ¡Empate! | Match nul ! | Pareggio! | Empate! | 引き分け！ | 무승부! | Ничья! | Gelijkspel! | Remis! | Berabere! | Oavgjort! | تعادل! |

## 难度 / 模式

| key | en | zh | zh-TW | de | es | fr | it | pt | ja | ko | ru | nl | pl | tr | sv | ar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | Easy | 简单 | 簡單 | Leicht | Fácil | Facile | Facile | Fácil | 初級 | 쉬움 | Легко | Makkelijk | Łatwy | Kolay | Lätt | سهل |
| medium | Medium | 中等 | 中等 | Mittel | Medio | Moyen | Medio | Médio | 中級 | 보통 | Средне | Normaal | Średni | Orta | Medel | متوسط |
| hard | Hard | 困难 | 困難 | Schwer | Difícil | Difficile | Difficile | Difícil | 上級 | 어려움 | Сложно | Moeilijk | Trudny | Zor | Svår | صعب |
| expert | Expert | 专家 | 專家 | Experte | Experto | Expert | Esperto | Especialista | 達人 | 매우 어려움 | Эксперт | Expert | Ekspert | Uzman | Expert | خبير |
| standard | Standard | 标准 | 標準 | Standard | Estándar | Standard | Standard | Padrão | 標準 | 기본 | Стандарт | Standaard | Standardowy | Standart | Standard | قياسي |
| daily | Daily | 每日 | 每日 | Täglich | Diario | Quotidien | Giornaliero | Diário | デイリー | 매일 | Ежедневно | Dagelijks | Codziennie | Günlük | Daglig | يومي |

## 品牌与设备词(所有语言一律保留原文,不翻译)

E-Ink Games、Kindle、Kindle Paperwhite、Kindle Scribe、Kindle Colorsoft、BOOX、Kobo、reMarkable、PocketBook、EPUB、e-ink / E-Ink(作为技术名词时)、Sudoku / Minesweeper / 2048 / Nonogram / Wordle 等游戏名、X / O(井字棋棋子)。

## 站点 chrome 参照(与姊妹站 e-ink.me 一致的口径)

免费 → free / gratis / gratuit / gratis / grátis / 無料 / 무료 / бесплатно / gratis / za darmo / ücretsiz / gratis / مجانًا;
无需下载 → no download;浏览器 → browser / navegador / navigateur / ブラウザ / 브라우저 / браузер / przeglądarka / tarayıcı / webbläsare / متصفح。
