# DragonClaw - 寮€鍙戜换鍔℃€昏〃 (AI 寮€鍙戣鑼冪増)

## Phase 5.55.1: Gateway RPC Readiness Grace
- [ ] Prevent false OpenClaw startup failure while gateway sidecars are warming up by separating true `gateway ready` log detection from HTTP listening, widening RPC probe timeouts, and preserving persistent-service reuse without changing Tauri command or `invoke()` contracts.

## Phase 5.56: Workspace Task Card and Editor Refresh
- [ ] Rebuild the `workspace-clone` task drawer cards and task editor modal into the new compact layout, remove the inline recent-runs block, keep task titles human-readable, stabilize the enabled/disabled filters, correct the task dropdown menu styling, and show concrete trigger timing for task loops without changing real cron / Gateway / `invoke()` contracts.

## Phase 5.55: Startup Flow Single Source and Persistent Service
- [ ] Unify startup into the React guide/setup surface, remove the static Booting splash and duplicate OpenClaw startup overlay, keep homepage chat from replaying the normal startup checklist, and leave OpenClaw running across DragonClaw quits for fast reuse without changing Tauri command or `invoke()` contracts.

## Phase 5.54: 鍐呯疆 OpenClaw 鍗囩骇鍒?v2026.5.4
- [ ] 灏?DragonClaw 鍐呯疆 OpenClaw 閿佸畾鐗堟湰浠?`v2026.4.27` 鍗囩骇鍒?`v2026.5.4`锛屼繚鎸?`.openclaw_version` 鑷姩閲嶈銆乣pnpm install` + 鏉′欢 `pnpm build` 瀹夎閾捐矾锛屼互鍙婃湰鍦?gateway / Control UI / 棣栭〉鑱婂ぉ鍥炲綊鍙敤锛屼笉鏀逛换浣?Tauri command 绛惧悕鎴栧墠绔?`invoke()` 濂戠害銆?
## Phase 5.53: Workspace 浠诲姟鎶藉眽鏍峰紡鏀舵暃
- [x] 鏀舵暃 `workspace-clone` 鍙充晶浠诲姟鎶藉眽鐨勫垪琛ㄦ牱寮忎笌鎿嶄綔鍏ュ彛锛屾敼涓虹揣鍑戜换鍔¤銆佽交閲忚繍琛?footer 涓庢洿澶氳彍鍗曪紝涓嶆墿灞曚换鍔″垱寤鸿兘鍔涳紝涔熶笉鏀瑰姩鐜版湁鐪熷疄 cron / `invoke()` 濂戠害銆?
## Phase 5.52: Workspace 鐪熷疄浠诲姟绠＄悊鎺ュ叆
- [ ] 灏?`workspace-clone` 鍙充晶浠诲姟鎶藉眽鍒囨崲鍒扮湡瀹?OpenClaw `cron` 鏁版嵁锛屾敮鎸佺湡瀹炲垪琛ㄣ€佺紪杈戙€佸惎鍋溿€佸垹闄ゃ€佺珛鍗宠繍琛屽拰鏈€杩戣繍琛岀粨鏋滃睍绀猴紝涓嶆柊澧炰换鍔″垱寤哄叆鍙ｏ紝涔熶笉鏀瑰姩鐜版湁 Tauri command / `invoke()` 濂戠害銆?## Phase 5.42a: Security Hotfix
- [ ] 淇閭缁戝畾 `.env` 娉ㄥ叆銆乬ateway token 鏆撮湶杈圭晫銆佹晱鎰熷嚟鎹惤鐩樹笌瀹夎/鎻掍欢瀹屾暣鎬ф牎楠岄棶棰橈紝涓嶆敼鐜版湁 Tauri command 绛惧悕鎴?`invoke()` 濂戠害銆?
- [ ] 鏈疆鎸変繚瀹堢儹淇墽琛岋細鍙慨 `workspace-clone` cron 绌?agent 璇粦銆佹ā鍨嬪垏鎹?busy 鍗℃銆乣--dc-workspace-accent-border` 缂哄け锛汣ontrol UI `#token=` 涓庤亰澶╃紦瀛樻槑鏂囪惤鐩樻敼涓轰笅涓€闃舵涓撻」锛屼笉鍦ㄦ湰杞洿鎺ユ敼鍔ㄩ珮椋庨櫓閾捐矾銆?## Phase 5.43: Startup Truth Source and Encoding Cleanup
- [ ] 缁熶竴鏈嶅姟鐢熷懡鍛ㄦ湡鐪熸簮锛岀Щ闄ゅ墠绔?optimistic ready / 鏃ュ織鏂囨 ready 鍒ゅ畾锛屽苟淇鍚姩銆佽缃€佽亰澶┿€佺粦瀹氫笌鏈嶅姟鎻愮ず涓殑楂樻洕鍏変贡鐮佹枃鏈€?
## Phase 5.44: Config Repository Completion
- [ ] 灏?`openclaw.json` 鍐欏叆鍙ｇ户缁敹鍙ｅ埌 `ConfigRepository`锛屼慨澶?`save_api_config` 鍙屽啓涓庡悶閿欓棶棰橈紝淇濇寔 JSON shape 涓庣幇鏈夊绾︿笉鍙樸€?
## Phase 5.45: Workspace Clone Consolidation
- [ ] 缁х画鎷嗗垎 `workspace-clone` 鑱婂ぉ/娓犻亾缂栨帓锛屼慨澶?`openBindingModal` 闄堟棫蹇収鍒ゆ柇锛屽苟鍚屾钀藉疄澶ф枃浠剁害鏉熶笌鐩綍鑱岃矗杈圭晫銆?
## Phase 5.46: Channel Flow Unification
- [ ] 缁熶竴娓犻亾 / 閭 / 浜岀淮鐮佹帴鍏?flow銆乼yped payload 涓庡畬鎴愭€侊紝淇濇寔鐜版湁 command 鍚嶇О銆佸弬鏁板拰杩斿洖 shape 涓嶅彉銆?
## Phase 5.47: IA, Test, and Governance Follow-through
- [ ] 鏀舵暃鍗犱綅淇℃伅鏋舵瀯锛岃ˉ鍚姩/閰嶇疆/娓犻亾/鑱婂ぉ鍏抽敭鑷姩鍖栨姢鏍忥紝骞剁户缁笅璋冨ぇ鏂囦欢 baseline 涓庣紪鐮侀棬绂併€?
## Phase 5.50: workspace-clone 鑱婂ぉ鍘熷宸ュ叿/鍛戒护鍥炴樉闅愯棌
- [ ] 涓?`workspace-clone` 鑱婂ぉ鍖洪殣钘忓師濮嬪伐鍏?鍛戒护鍥炴樉姘旀场锛屼繚鐣欑簿绠€ live timeline 涓庢渶缁堥潰鍚戠敤鎴风殑姝ｆ枃鍥炵瓟锛屼笉淇敼缃戝叧鍗忚鎴?`invoke()` 濂戠害銆?## Phase 5.51: 棣栭〉鑱婂ぉ杩為€氬け璐ヤ笌缃戝叧鐪熺浉淇
- [ ] 淇棣栭〉鑱婂ぉ闀挎湡鍋滅暀鍦ㄢ€滄鍦ㄩ獙璇佺綉鍏?/ 杩炴帴鑱婂ぉ鈥濆嵈濮嬬粓杩炰笉涓婄殑闂锛岀粺涓€ ready 鐪熺浉涓?PID 瀛樻椿 + 绔彛鐩戝惉 + RPC/token 鏍￠獙閫氳繃锛屽苟鍦?stale runtime state 鎴栨祻瑙堝櫒渚ф彙鎵嬪け璐ユ椂杩斿洖鐪熷疄澶辫触鎬佽€屼笉鏄亣澶嶇敤銆?## Phase 5.41: State and Config Consolidation
- [ ] 鏀跺彛 `openclaw.json` 鍐欏叆鍙ｃ€佹湇鍔＄敓鍛藉懆鏈熺粨鏋勫寲鐪熸簮涓?Control UI 棰勬瀯寤鸿矾寰勶紝涓嶆敼鍙樻棦鏈?Tauri command 绛惧悕鎴栧墠绔?`invoke()` 鍗忚銆?
## Phase 5.41: Startup Source Mojibake Cleanup and Encoding Guard
- [ ] 淇 `channels` 鍚庣涓?`workspace-clone` 鍓嶇涓湡瀹炲瓨鍌ㄧ殑閿欑爜瀛楃涓?鍧忔爣鐐癸紝鎭㈠鍚姩鍙紪璇戠姸鎬侊紝骞跺鍔?UTF-8 涔辩爜闃插洖褰掓鏌ヨ剼鏈€?
## Phase 5.42: Workspace Command Modal Simplification and Editor Refresh
- [ ] 绠€鍖?`workspace-clone` 鍛戒护寮圭獥涓哄崟鍒楄〃缁撴瀯锛屽苟灏嗘柊澧?缂栬緫鍛戒护鏀逛负鍙傝€冨浘鏍峰紡鐨勭嫭绔嬪眳涓〃鍗曞脊绐楋紝淇濇寔鐜版湁 slash command 琛屼负涓?`invoke()` 濂戠害涓嶅彉銆?
## Phase 5.40: Large Module Split
- [ ] Split homepage chat, workspace ready-page controllers, and channel backend into smaller internal modules without changing Tauri command signatures or frontend invoke contracts.
- [ ] Add enforceable large-file guardrails for frontend pages/hooks and Rust modules so active split work does not recreate new oversized files.

## Phase 5.39: Chat Startup and Gateway Stability
- [ ] Move ready-workspace service startup feedback into an independent in-chat panel and stabilize gateway WebSocket/RPC readiness.

## Phase 5.38: 涓€娆″紩瀵间笌甯搁┗鏈嶅姟蹇惎
- [ ] 寮曞叆鐙珛 Launcher 鐘舵€佹枃浠讹紝鍖哄垎棣栨寮曞涓庡悗缁揩鍚矾寰勶紝骞惰 DragonClaw 閫€鍑哄悗缁х画澶嶇敤甯搁┗ OpenClaw 鏈嶅姟銆?
## Phase 5.37: Workspace 閭缁戝畾鍔熻兘杩佺Щ
- [ ] 灏?`workspace-clone` composer 閭缁戝畾鍏ュ彛銆丷eact modal銆乣imap-smtp-email` 鍏煎閰嶇疆璇诲啓涓庣嫭绔?Tauri command 杩佺Щ鍒伴」鐩腑锛屽苟闄愬畾鍙奖鍝嶈亰澶╁伐浣滃尯銆?
## Phase 5.37: workspace-clone Slash Command 杩佺Щ
- [ ] 鍦?`workspace-clone` 涓縼绉诲叏灞€鍏变韩 Slash Command锛屾敮鎸佺郴缁熼粯璁?鐢ㄦ埛鑷畾涔変袱绫绘ā鍨嬶紝棣栫増瀹屾暣钀藉湴鑷畾涔夊懡浠ょ殑绠＄悊銆乣/` 鑱旀兂銆佹縺娲绘€佸睍绀轰笌鍙戦€佺敓鏁堥摼璺?
## Phase 5.35: workspace-clone 瀛橀噺涔辩爜鏂囨娓呯悊
- [ ] 娓呯悊 `workspace-clone` 涓畫鐣欑殑閿欑爜涓枃鏂囨涓庢彁绀鸿锛岄檺瀹氫负鍓嶇娓叉煋灞傚瓧绗︿覆淇锛屼笉鏀瑰姩 `invoke()`銆佷簨浠跺鐞嗗拰鍚庣鎺ュ彛

## Phase 5.33: OpenClaw 缃戝叧鍚姩澶辫触淇
- [ ] 灏嗘暟瀛楀憳宸ユ墭绠″厓鏁版嵁绉诲嚭 `openclaw.json`锛岃嚜鍔ㄦ竻鐞嗘棫 `dragonclawManagedSource` 瀛楁锛屽苟淇 OpenClaw 2026.4.27 缃戝叧鍚姩澶辫触

## Phase 5.32: 棣栭〉鏃犲搷搴斿穿婧冪殑鏈嶅姟蹇冭烦涓庢棩蹇楅鏆翠慨澶?- [ ] 淇 OpenClaw 鏈嶅姟蹇冭烦绾跨▼鍙犲姞銆乄indows PowerShell 杩涚▼鎺㈡祴鍜岄珮棰戞棩蹇椾簨浠跺鑷寸殑棣栭〉鏃犲搷搴?AppHang 椋庨櫓锛屼繚鎸佹棦鏈?Tauri command 绛惧悕涓嶅彉

## Phase 5.29: 棣栭〉鏈搷搴斾笌 SkillHub 鍚庡彴瀹夎淇
- [ ] 鎷嗗垎 `agency-agents.json` 涓鸿交閲?roster 涓庢寜 Agent ID 鍒嗙墖妯℃澘锛屽憳宸ラ〉/鎶€鑳藉競鍦烘噿鍔犺浇锛屽憳宸ヨ鎯呮寜闇€鍔犺浇妯℃澘锛屽苟灏?onboarding SkillHub 鎺ㄨ崘鎶€鑳藉畨瑁呭垏鍒板悗绔悗鍙颁换鍔?
## Phase 5.20: 鏁板瓧鍛樺伐涓枃鍚嶇О缁熶竴鏄剧ず
- [x] 鍦?`workspace-clone` 鍐呯粺涓€灏?Agent 灞曠ず鍚嶅垏鍒拌鑹插簱涓枃鍚嶇О鏉ユ簮锛屽苟灏?`main` 鐨勬墍鏈夌敤鎴峰彲瑙佸悕绉版樉绀轰负鈥滀富鍒嗚韩鈥濓紝鍚屾椂淇濈暀鑻辨枃 `agentId` 鎼滅储涓庡唴閮ㄧ粦瀹?瀹夎璇箟涓嶅彉

## Phase 5.15.9: 棣栭〉鏀剁缉渚ц竟鏍忚瑙夐噸璁捐
- [x] `workspace-clone` 棣栭〉鏀剁缉鎬佷晶杈规爮鏀逛负鍙傝€冨浘椋庢牸鐨勫弻杞ㄨ交閲忓鑸紝缁熶竴宸︿晶鑿滃崟杞ㄤ笌鍙充晶杩蜂綘鐩綍杞ㄧ殑鍗＄墖鑺傚銆侀棿璺濄€侀槾褰卞拰閫変腑鎬?
## Phase 5.15.11: `workspace-clone` 鍏ㄥ煙鎮诞楂樹寒缁熶竴
- [ ] 涓?`workspace-clone` 宸︿晶鑿滃崟銆佺浜屾爮銆佷富鍖哄ご閮ㄣ€乨rawer銆乧omposer銆乸opover 涓庝笓灞炲脊灞傜粺涓€鍙敤鎬?hover / focus-visible 楂樹寒鍙嶉锛屽苟淇濇寔 `active > hover > default`銆乣muted/disabled` 璇箟涓嶅彉

## Phase 5.11: 鏃?logo 鍒囨崲涓烘柊 logo 寮曠敤
- [ ] 鍓嶇鎵€鏈夋棫 `logo.jpg` 灞曠ず浣嶇粺涓€鍒囨崲鍒版柊鐨?DragonClaw 榫欏舰 logo锛屽苟绉婚櫎榛樿 Vite favicon 寮曠敤

## Phase 5.10: DragonClaw 涓绘帶鍒剁晫闈㈡暣椤靛厠闅?- [x] 榛樿棣栭〉鍒囨崲鍒版暣椤靛厠闅嗗伐浣滃彴锛屽苟瀹屾垚鏃?`legacy` 鎺у埗鍙板３灞備笌 `open_console` 鐨勯€€褰规敹鍙?
## Phase 5.8: 寮曞娴佺▼闈欓粯鑷姩鍚姩
- [ ] 寮曞娴佺▼鍦ㄧ幆澧?閰嶇疆灏辩华鍚庤嚜鍔ㄥ惎鍔?OpenClaw 鏈嶅姟锛岄娆℃棤閰嶇疆鏃惰嚜鍔ㄨ惤鍦伴粯璁ゅ伐浣滃尯骞剁洿閫氫富鐣岄潰锛屼笖涓嶈嚜鍔ㄦ墦寮€ OpenClaw 椤甸潰

## Phase 5.9: Git 蹇界暐瑙勫垯娓呯悊
- [x] 鎺掗櫎 `node_modules` 鍑?Git 鎻愪氦鑼冨洿锛屽苟浠庣储寮曚腑绉婚櫎宸茶窡韪緷璧栫洰褰?
> 鏈枃浠剁敤浜庤拷韪」鐩殑鏁翠綋杩涘害锛岀敱 AI 鎴栧紑鍙戣€呭湪瀹屾垚鐗瑰畾鍔熻兘鍚庢墦鍕炬洿鏂般€傚畠浣滀负璺ㄨ秺澶氫釜 Context 鐨勯暱鏈熻蹇嗕笌杩涘害閿氱偣銆?
## 馃搨 椤圭洰缁撴瀯涓庢枃妗ｈ鑼?(褰撳墠)
- [x] 杈撳嚭瀹屾暣鍟嗕笟 PRD (`/docs/PRD.md`)
- [x] 寤虹珛闃舵鎬у紑鍙戞枃妗?(`/docs/phases/*.md`)
- [x] 寤虹珛骞剁淮鎶ゆ鍏ㄥ眬浠诲姟琛?(`/docs/TODO.md`)

## Phase 1: MVP 鏍稿績瀹夎鍣?- [x] 鎼缓 Tauri + React 鍩虹椤圭洰鑴氭墜鏋?- [x] 瀹炵幇 Rust 涓?Node.js 涓嬭浇涓庢湰鍦伴噴鏀?- [x] 瀹炵幇婧愮爜 ZIP 缃戠粶鎷夊彇涓庤В鍘?- [x] 瀹炵幇 `npm install` + 闀滃儚鑷姩鍒囨崲
- [x] 瀹炵幇鍩虹鎺у埗鍙?UI
- [ ] [Phase 1 娴嬭瘯]: 绾噣鐗?Windows/Mac 铏氭嫙鏈烘棤鎶ラ敊鍚姩

## Phase 2: "Aha Moment" 浣撻獙鏀瑰杽
- [x] 閰嶇疆娉ㄥ叆: 鑷姩鐢熸垚 `openclaw.json`
- [x] 閰嶇疆娉ㄥ叆: 鑷姩鐢熸垚 `models.json`
- [x] 宸ヤ綔鍖哄悜瀵? 棣栨鍚姩寮瑰嚭鏂囦欢澶归€夋嫨
- [x] 鍚姩鍚庤嚜鍔ㄦ墦寮€娴忚鍣?- [x] UI 鍗囩骇: 鐘舵€佸ぇ鍗＄墖
- [x] 浜鸿瘽鏃ュ織: 鏃ュ織缈昏瘧灞?+ 鍘熷/浜鸿瘽鍒囨崲
- [x] 棰勭疆鎶€鑳藉寘
## Phase 2.5: 绋冲畾鎬у厹搴?- [x] pnpm.cjs 璺緞鍔ㄦ€佹帰娴?- [x] 绔彛鍗犵敤妫€娴?+ 鑷姩鎹㈢鍙?- [x] 鏈嶅姟杩涚▼宕╂簝妫€娴?- [x] CMD 寮圭獥闅愯棌 (CREATE_NO_WINDOW)
- [x] Gateway 姝ｇ‘鍚姩 (gateway + --allow-unconfigured + --port)
- [x] Gateway Auth Token 鑷姩閰嶇疆
- [x] 鑷姩绔彛閫夋嫨 (18789-18799 鎵弿)
- [x] Windows 涓枃鐢ㄦ埛鍚嶈矾寰勭紪鐮佸吋瀹?- [x] Windows 260 瀛楃闀胯矾寰勯檺鍒跺鐞?- [x] 瀹屽叏鏂綉鍙嬪ソ鎻愮ず
- [x] 纾佺洏绌洪棿棰勬鏌?## Phase 3: v1.0 涓婄嚎鐗堟湰 - UI 閲嶆瀯 + API Key 閰嶇疆

### 蹇呰鍔熻兘 (Must-Have)

#### API Key 閰嶇疆寮曞
- [x] API Key 棣栨寮曞椤甸潰 (SetupPage)
- [x] 涓绘祦鎻愪緵鍟嗗垪琛?(Nvidia/OpenRouter/Groq/鏅鸿氨GLM/闃块噷鐧剧偧/瀛楄妭鏂硅垷/DeepSeek/OpenAI/Kimi)
- [x] API Key 杈撳叆妗?+ 淇濆瓨
- [x] 鑷畾涔変腑杞珯鏀寔 (Base URL + API Key)
- [x] 閰嶇疆鍐欏叆 OpenClaw 閰嶇疆绯荤粺
#### 妯″瀷閫夋嫨涓庡垏鎹?- [x] 妯″瀷閫夋嫨椤甸潰 (ModelPage)
- [x] 鏍规嵁宸查厤缃?Key 鏄剧ず鍙敤妯″瀷鍒楄〃
- [x] 涓€閿垏鎹㈤粯璁ゆā鍨?#### UI 澶ч噸鏋?- [x] Tab 瀵艰埅甯冨眬 (浠〃鐩?/ 妯″瀷 / 璁剧疆 / 鏃ュ織)
- [x] 浠〃鐩? 鏈嶅姟鐘舵€?+ 鍚仠 + 鎵撳紑缃戦〉绔?- [x] 璁剧疆椤? 绔彛銆佺増鏈€佸伐浣滃尯
- [x] 鏃ュ織椤? 鍗曠嫭椤甸潰锛岀粰寮€鍙戣€呯敤
- [x] 绮捐嚧娣辫壊涓婚 (娓愬彉/鍗婇€忔槑/寰姩鏁?
#### 鍚庣 Tauri 鍛戒护
- [x] `save_api_config(provider, api_key, base_url)` 淇濆瓨閰嶇疆
- [x] `get_current_config()` 璇诲彇褰撳墠鐘舵€?- [x] `set_default_model(model_id)` 鍒囨崲妯″瀷
- [x] `get_providers()` 鑾峰彇鎻愪緵鍟嗗垪琛?- [x] `open_provider_register()` 鎵撳紑娉ㄥ唽椤?### 楂樼骇鍔熻兘 (v1.1+ Later)
- [ ] Google Gemini OAuth 涓€閿櫥褰?- [ ] ChatGPT OAuth 鐧诲綍
- [ ] Ollama 鏈湴妯″瀷闆嗘垚
- [ ] System Tray 鍚庡彴瀹堟姢
- [ ] 浠ｇ悊/缃戠粶鑷姩妫€娴嬩慨澶?- [ ] 鏃ュ織瀵煎嚭涓€閿墦鍖?- [ ] i18n 鍥介檯鍖?## Phase 3.5: Premium UI 閲嶆瀯涓庝綋楠屾墦纾?(Next)
- [x] **瑙嗚閲嶆瀯**: 寮曞叆鏋佺畝娣辫壊楂樼骇鐨偆 (姣涚幓鐠冦€佺函榛戝簳鑹层€佸井濡欐笎鍙?
- [x] **瀵艰埅绮剧畝**: 绉婚櫎涓荤骇鈥滄棩蹇椻€漈ab锛屽皢鍏跺苟鍏モ€滆缃€濅綔涓轰簩绾ф爮鐩?- [x] **璁剧疆閲嶆瀯 (瀛愯矾鐢?**:
  - [x] `閫氱敤`: 涓婚鍒囨崲 (鏄?鏆?銆佸紑鏈鸿嚜鍚紑鍏?  - [x] `鏃ュ織`: 绠€鍖栧睍绀哄眰锛屽鍔燵涓€閿鍑烘棩蹇梋 ZIP 鍔熻兘
  - [x] `鍏充簬`: 鐗堟湰淇℃伅銆佹鏌ユ洿鏂版満鍒?  - [x] `寮€婧愮ぞ鍖篳: 鎺掔増鎺ㄨ崘寮€婧愰」鐩強閾炬帴
- [x] **浠〃鐩樼編鍖?*: 鍘荤嚎妗嗗寲锛岀姸鎬佺伅涓庢ā鍨嬪睍绀烘瀬绠€澶勭悊
- [x] **妯″瀷椤甸噸鏋?*: 缃戞牸甯冨眬 + 寮圭獥 (Modal) 閰嶇疆浜や簰

## Phase 4: 鏋舵瀯閲嶆瀯
- [x] Stage 1: 鍩虹璁炬柦 (types/utils 鎻愬彇) `v2-stage1-complete`
- [x] Stage 2: 閫氱敤 UI 缁勪欢 (Modal) `v2-stage2-complete`
- [x] Stage 3: 椤甸潰缁勪欢鎷嗗垎 (Header/ApiKeyModal/SetupWizard) `v2-stage3-complete`
- [x] Stage 4: Custom Hooks (`useLogs/useConfig/useService`) `v2-stage4-complete`
- [x] Stage 5: 鍚庣 Rust 妯″潡鎷嗗垎 `v2-stage5-complete`
- [x] Stage 6: Provider 鏁版嵁澶栫疆 `v2-stage6-complete`

## Phase 4.5: 鏋舵瀯鎵撶（ (娑堥櫎鍗忎綔鐡堕)
- [x] Stage 7: CSS 妯″潡鍖栨媶鍒?`v2-stage7-complete`
- [x] Stage 8: Tab 椤甸潰缁勪欢鎷嗗垎 `v2-stage8-complete`
- [x] Stage 9: config.rs 鑱岃矗鎷嗗垎 `v2-stage9-complete`

## Phase 4.6: 鏈€缁堟墦纾?(App.tsx -> ~150 琛?
- [x] Stage 10: 寮圭獥缁勪欢鎻愬彇 `v2-stage10-complete`
- [x] Stage 11: useService Hook 鎷嗗垎 `v2-stage11-complete`

## Phase 5: UI 椋庢牸缁熶竴 (閰嶈壊 + 鍥炬爣涓€鑷存€?
- [x] Stage 12: 鑹插僵浣撶郴閲嶇疆 `v2-stage12-complete`
- [x] Stage 13: Emoji -> Lucide 鍥炬爣缁熶竴 `v2-stage13-complete`
- [x] Stage 14: 鍐呰仈鑹插€兼竻鐞?`v2-stage14-complete`

## Phase 5.1: UX 缁嗚妭鎵撶（
- [x] Stage 15: Tab 鍒囨崲鎶栧姩淇 + 琛ㄥ崟瀹藉害浼樺寲 + 寮圭獥璺冲姩淇 + 娈嬩綑缁胯壊娓呯悊 `v2-stage15-complete`

## Phase 5.2: 鏃ュ織璇婃柇闈㈡澘浼樺寲
- [x] Stage 16: 鏃ュ織闈㈡澘绠€鍖?+ 瀵煎嚭璇婃柇 ZIP `v2-stage16-complete`

## Phase 5.3: 鍏充簬椤甸潰浼樺寲
- [x] Stage 17: 鐗堟湰妫€鏌?(GitHub API + 鏃嬭浆鍔ㄧ敾) + 浜岀淮鐮佹浛鎹?`v2-stage17-complete`

## Phase 5.4: 瀹夎鐣岄潰 Premium 浼樺寲
- [x] Stage 18: 鍚姩鐢婚潰鏋佸厜娴姩閲嶆瀯 `v2-stage18-complete`

## Phase 5.5: 浠〃鐩樹綋楠屼紭鍖?+ 绔彛鎵╁睍
- [x] Stage 19: 鍏ㄥ眬鍚姩鍔犺浇妗?+ Logo 鏇挎崲 + 鑴夊啿鍏夋晥 + 绔彛鑼冨洿鎵╁睍 `v2-stage19-complete`

## Phase 5.6: 鑷畾涔夋ā鍨?ID 杈撳叆
- [x] Stage 20: ApiKeyModal + ModelSwitchModal 鏀寔鎵嬪姩杈撳叆妯″瀷 ID `v2-stage20-complete`

## Phase 5.7: 澶氬钩鍙扮ǔ瀹氭€т慨澶?- [x] OpenClaw 鐗堟湰閿佸畾 (`download.rs` pin `v2026.2.6-1` + `.openclaw_version` 鏍囪 + 鑷姩鐗堟湰妫€娴? `v0.4.1`
- [x] node-llama-cpp 鏅鸿兘閲嶈瘯 (`installer.rs` 妫€娴?postinstall 宕╂簝 -> `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true` 閲嶈瘯) `v0.4.2`
- [x] Ubuntu 闂€€淇 (`environment.rs` 鏇挎崲 unsafe `Statvfs` FFI 涓?`df` 鍛戒护) `v0.4.3`
- [x] Windows node-llama-cpp 鍏煎鎬у寮?(`installer.rs` 鎵╁睍妫€娴?+ `SKIP_BUILD` 璺宠繃婧愮爜缂栬瘧) `v0.4.4`
- [x] 鍙戠増娴佺▼瑙勮寖鍖?(`AGENTS.md` 鏂板鐗堟湰鍚屾娓呭崟 + Release Notes 妯℃澘) `v0.4.1`
- [x] GPL-3.0 璁稿彲璇佸垏鎹?+ 43 鏂囦欢鐗堟潈澶?+ README_EN 鍚屾 `v0.4.1`
- [x] Phase 5.17: 鍗囩骇鍐呯疆 OpenClaw 鍒?`v2026.4.27`锛屽苟瀹屾垚鏃у畨瑁呰嚜鍔ㄩ噸瑁呫€佸叏鏂板畨瑁呫€乬ateway 鎻℃墜涓庨椤佃亰澶╅摼璺洖褰掗獙璇?
---

## V3 璺嚎鍥?(`v3-dev` 鍒嗘敮)
> **涓夌楠屾敹**: 鎵€鏈?V3 鏀瑰姩蹇呴』鍦?Windows / Linux / macOS 涓夌楠岃瘉閫氳繃銆?> **UI 瑙勮寖**: 閬靛惊鐜版湁娣辫壊涓婚閰嶈壊 (`--bg-*`, `--accent-*`)銆丩ucide 鍥炬爣浣撶郴銆乣framer-motion` 鍔ㄧ敾銆?### Phase 7: System Tray + 鍚姩鏇存柊妫€鏌?-> `v0.5.0`
- [ ] System Tray 鎵樼洏鍥炬爣 + 鍙抽敭鑿滃崟 (鎵撳紑闈㈡澘/娴忚鍣?閲嶅惎/閫€鍑?
- [ ] 鍏抽棴绐楀彛 -> 鏈€灏忓寲鍒版墭鐩橈紝鏈嶅姟涓嶄腑鏂?- [ ] 鎵樼洏鍥炬爣鍔ㄦ€佺姸鎬?(杩愯涓?/ 宸插仠姝?
- [ ] 鍚姩鑷姩妫€鏌ユ洿鏂?(GitHub API -> 寮圭獥 -> "鍓嶅線涓嬭浇")
- [ ] 鏂綉/鏃犳洿鏂版椂闈欓粯蹇界暐

### Phase 8: 鏅鸿兘浣?+ AI 寮曟搸澧炲己 -> `v0.6.0`

#### 8.1 AI 寮曟搸鏀圭増 - 澶?Provider 绠＄悊
- [x] 5-Tab 瀵艰埅鎵╁睍 (浠〃鐩?/ AI 寮曟搸 / 鏅鸿兘浣?/ 鏁版嵁缁熻 / 璁剧疆)
- [ ] AI 寮曟搸椤甸潰鏀圭増: 宸蹭繚瀛?Provider 鍗＄墖鍒楄〃
- [ ] 娣诲姞 / 缂栬緫 / 鍒犻櫎 Provider
- [ ] ApiKeyModal 楂樺害浼樺寲: 榛樿灞曠ず 3 閫夐」鏃犻渶婊氬姩

#### 8.2 Agent 绠＄悊澧炲己
- [x] Agent 鍗＄墖缃戞牸鍩虹灞曠ず
- [ ] 鍒涘缓 Agent: 鍚嶇О + 妯″瀷涓嬫媺 + 绯荤粺鎻愮ず璇?- [ ] 缂栬緫 Agent: 鍒囨崲妯″瀷 + 淇敼鎻愮ず璇?+ 鏉冮檺
- [ ] 鍒犻櫎 Agent -> 鍚屾娓呯悊 openclaw.json + workspace
- [ ] 鏉冮檺鎺у埗: `subagents.allowAgents` 閰嶇疆
- [ ] openclaw.json agents.list 鍚屾

#### 8.3 Agent 瀵硅瘽 + 浼氳瘽
- [ ] 鍗＄墖鈥滃璇濃€濇寜閽?-> 娴忚鍣ㄦ墦寮€ agent 浼氳瘽
- [ ] 浼氳瘽鍘嗗彶鍒楄〃灞曠ず + 鐐瑰嚮鎭㈠

#### 8.4 鍏朵粬
- [x] 鏁版嵁缁熻 Tab 鍗犱綅椤甸潰
- [ ] 鏁版嵁缁熻椤甸潰婊氬姩鏉′慨澶?- [x] 宸插畨瑁呮妧鑳藉垪琛ㄥ睍绀?### Phase 9: 骞冲彴鎺ュ叆閰嶇疆 -> `v0.7.0`
- [ ] config.rs 閲嶆瀯: 瀛楃涓叉嫾鎺?-> `serde_json::Value` 缁撴瀯鍖栬鍐?- [ ] Telegram 閰嶇疆寮曞 (BotFather -> Token -> 绛栫暐)
- [ ] Discord 閰嶇疆寮曞 (Dev Portal -> Token -> 鏉冮檺)
- [ ] 椋炰功閰嶇疆寮曞 (寮€鏀惧钩鍙?-> App ID/Secret -> 浜嬩欢璁㈤槄)
- [ ] 骞冲彴杩炴帴鐘舵€佸睍绀?+ 缂栬緫/鍒犻櫎

### Phase 10: i18n + Ollama + 鏁版嵁缁熻 -> `v0.8.0`
- [ ] i18n 鍥介檯鍖?`react-i18next` (zh-CN + en)
- [ ] 璁剧疆椤佃瑷€鍒囨崲
- [ ] Ollama 妫€娴?+ 鏈湴妯″瀷鍒楄〃 (鏁村悎鍒?AI 寮曟搸椤甸潰)
- [ ] 鏁版嵁缁熻 Tab: 璇锋眰閲忚秼鍔挎姌绾垮浘
- [ ] 鏁版嵁缁熻 Tab: Token 鐢ㄩ噺鍗＄墖 (杈撳叆/杈撳嚭/鎬昏)
- [ ] 鏁版嵁缁熻 Tab: 妯″瀷鍒嗗竷楗煎浘 + 璐圭敤浼扮畻

---

## 鍙戝竷瑙勮寖 Checklist (姝ｅ紡鍙戝竷鍓嶅繀璇?
> **鐗堟湰鍙疯鑼?*: Semantic Versioning (`MAJOR.MINOR.PATCH`)
> - 褰撳墠: `0.4.4` -> 涓嬩釜鍔熻兘鐗堟湰 `0.5.0`锛屼慨 bug `0.4.5`锛屾寮忕増 `1.0.0`

| 姝ラ | 璇存槑 |
|---|---|
| 1. 鏇存柊 `package.json` version | 鍞竴鐪熺浉婧愶紝浠ｇ爜鍜屾鏌ユ洿鏂伴兘浠庤繖閲岃 |
| 2. 鏇存柊 `Cargo.toml` version | Tauri 涔熼渶瑕佸悓姝?|
| 3. 鏇存柊 SettingsTab 鏄剧ず鐗堟湰 | `褰撳墠鐗堟湰 vX.X.X` 纭紪鐮佸 |
| 4. Git tag 鐢?semver | `git tag v0.4.0`锛岄潪 `v2-stageXX-complete` |
| 5. 鍦?GitHub 鍒涘缓 Release | 涓嶅彧鏄?tag锛孯elease 鎵嶄細琚?`/releases/latest` API 璇嗗埆 |
| 6. Release 闄勫甫瀹夎鍖?| `.msi` / `.dmg` / `.AppImage` 绛?|

> **娉ㄦ剰**: 寮€鍙戦樁娈电殑 `v2-stageXX-complete` tag 浠呬緵鍐呴儴杩借釜锛屼笉褰卞搷鐗堟湰妫€鏌ャ€?> 瀹㈡埛绔鏌ユ洿鏂版椂鍙 semver 鏍煎紡鐨?`tag_name` (`/^v?\d+\.\d+\.\d+$/`)銆?---

## Phase 6: 浼佷笟绾у垎鍙?- [ ] Sentry 閿欒涓婃姤 (opt-in)
- [ ] Windows 浠ｇ爜绛惧悕 (EV 璇佷功)
- [ ] macOS 鍏瘉 (notarization)
- [ ] 搴旂敤鍐呰嚜鍔ㄦ洿鏂?- [ ] 浼佷笟浠ｇ悊鏈嶅姟鍣ㄦ敮鎸?## 鑷姩鍖栨祴璇?- [x] Rust 鍗曞厓娴嬭瘯
- [x] CI 闆嗘垚
- [ ] 鍓嶇缁勪欢娴嬭瘯 (Vitest)
- [ ] E2E 娴嬭瘯: 瀹夎->閰嶇疆->鍚姩->瀵硅瘽
## 寮€婧愰」鐩鑼?- [x] LICENSE / CONTRIBUTING / CHANGELOG / SECURITY / CODE_OF_CONDUCT
- [x] GitHub Issue + PR 妯℃澘
- [ ] GitHub Discussions
- [ ] CI 鑷姩鐢熸垚 Release Notes
## Phase 5.12: 鑱婂ぉ宸ヤ綔鍖哄叏濂?UI 鍏嬮殕杩佺Щ
- [ ] 鍦?`workspace-clone` 鐨?`鑱婂ぉ` 鑿滃崟鍐呰ˉ榻?DragonClaw 鑱婂ぉ宸ヤ綔鍖哄叏濂楃晫闈㈤鏋讹紝淇濈暀绾墠绔亣浜や簰锛屼笉杩佺Щ鐪熷疄鍔熻兘
## Phase 5.13: 鎸夋埅鍥句紭鍖栬亰澶╁伐浣滃尯鐣岄潰
- [ ] 榛樿棣栭〉 `workspace-clone` 鐨?`鑱婂ぉ` 宸ヤ綔鍖烘寜鎴浘鏀舵暃涓鸿交閲忎笁鏍忓竷灞€锛屽苟琛ラ綈鍙充晶 Agent 璇︽儏鎶藉眽锛涘叾浠栬彍鍗曚笌 legacy 椤甸潰淇濇寔淇濈暀
- [ ] 棣栭〉鑱婂ぉ杈撳叆鍖虹Щ闄ら《閮ㄢ€滃彂閫佺粰鈥︹€濇彁绀哄拰宸ュ叿鏍忎笂鏂瑰垎闅旂嚎锛岃繘涓€姝ヨ创杩戠洰鏍囨埅鍥?
## Phase 5.14: 寮曞椤垫祬鑹查珮淇濈湡鏀圭増
- [ ] 寮曞娴佹寜鍙傝€冨浘缁熶竴涓烘祬鑹查珮淇濈湡璁捐锛屼繚鐣欑幇鏈夎繘搴︺€侀敊璇脊绐椼€佸伐浣滃尯閫夋嫨涓庣‘璁や氦浜?## Phase 5.15: 棣栭〉鑱婂ぉ鎺ュ叆鍐呯疆 OpenClaw
- [x] 鍦?`workspace-clone` 棣栭〉澶栧３鍐呮帴鍏ョ湡瀹?OpenClaw 缃戝叧鑱婂ぉ锛岄椤甸潤榛樺惎鍔ㄦ湇鍔″苟鎶娾€滄暟瀛楀憳宸モ€濆垏涓虹湡瀹?Agent 浼氳瘽鍏ュ彛
- [x] Phase 5.15.1: 淇棣栭〉鑱婂ぉ `gateway token mismatch`锛岀粺涓€浠?`~/.openclaw/openclaw.json` 鍔ㄦ€佽鍙?`gateway.auth.token`锛屽苟鍚屾棣栭〉/legacy 鎺у埗鍙板叆鍙?- [x] Phase 5.15.2: 淇 `workspace-clone` 棣栭〉涔辩爜锛屽苟鎭㈠鑱婂ぉ娑堟伅鍖哄煙婊氬姩
- [x] Phase 5.15.2: 鏀剁獎棣栭〉宸︿晶涓昏彍鍗曟爮锛屽苟鍘嬬缉鑱婂ぉ椤堕儴楂樺害涓庡垎鍓茬嚎瑙嗚閲嶉噺
- [x] Phase 5.15.2: 鎸夊弬鑰冨浘鏀舵暃棣栭〉宸︿晶渚ц竟鏍忕殑鑿滃崟鎺掑竷銆佸搧鐗屾按鍗颁笌搴曢儴鎿嶄綔鍖?- [x] Phase 5.15.2: 淇棣栭〉涓讳晶鏍忎笌鐩綍鏍忕殑鏀剁缉鎬佷綋楠岋紝缁熶竴鍙岃竟鏍忕獎杞ㄥ搴︺€佺暀鐧戒笌灞曞紑鍏ュ彛
- [x] Phase 5.15.2: 鎭㈠棣栭〉鑱婂ぉ娑堟伅姝ｆ枃鐨勬枃鏈€夋嫨鑳藉姏锛屾敮鎸佺洿鎺ユ閫夊鍒?- [x] Phase 5.15.3: 閲嶆瀯 `workspace-clone` 椤堕儴鏍囬鏍忎笌鑱婂ぉ浼氳瘽澶撮儴锛屽苟鏂板搴旂敤鍐呬豢鏍囬鏍?- [x] Phase 5.15.3: 灏嗗彸渚ф娊灞夊崌绾т负浼氳瘽杈规爮锛岃縼鍏ユā鍨嬨€佽蹇嗐€佹妧鑳藉簱銆佸懡浠ゃ€佸伐鍏锋潈闄愪富鍏ュ彛
- [x] Phase 5.15.3: 寮卞寲 composer 鏃у叆鍙ｅ苟淇濈暀 overlay 浣滀负浜岀骇璇︽儏瀹瑰櫒
- [x] Phase 5.15.4: 涓?`workspace-clone` 鏂板鐙珛妯″瀷閰嶇疆寮圭獥锛屽苟鎺ョ妯″瀷鐩稿叧鐐瑰嚮鍏ュ彛
- [x] Phase 5.15.4: 鍚屾 DragonClaw 妯″瀷鍘傚晢鍒楄〃鍒?workspace 妯″瀷寮圭獥绉佹湁鏁版嵁婧?- [x] Phase 5.15.4: 鏂板 workspace 涓撶敤妯″瀷閰嶇疆淇濆瓨/鍒犻櫎鍛戒护骞舵墦閫?openclaw.json 鎸佷箙鍖?- [x] Phase 5.15.5: 涓?`workspace-clone` 鑱婂ぉ鍙充晶浼氳瘽杈规爮鎺ュ叆 Agent 璁板繂寮圭獥锛屽苟鏀寔鎸夊綋鍓?Agent 璇诲啓鍥哄畾璁板繂鏂囦欢
- [x] Phase 5.15.6: 涓?`workspace-clone` 鑱婂ぉ鍙充晶杈规爮鎺ュ叆 Agent 鎶€鑳藉簱 / 宸ュ叿鏉冮檺寮圭獥锛屽苟鏀寔鎸夊綋鍓?Agent 璇诲啓鐪熷疄 skills / tools 閰嶇疆
- [x] Phase 5.15.6: 浼樺寲 Agent 璧勬簮寮圭獥楂樺害涓庢粴鍔紝淇濊瘉鎶€鑳?宸ュ叿鍒楄〃鍦ㄦ闈㈠拰涓皬灞忎笅鍙畬鏁存粴鍔?- [x] Phase 5.15.7: 灏嗗紩瀵兼帹鑽愭妧鑳藉畨瑁呬粠鏃?gateway `skills.search` 閾捐矾鍒囨崲鍒板畼鏂?`curl -fsSL https://skillhub.cn/install/install.sh | bash`锛屽苟淇涓绘妧鑳藉簱鏄剧ず鏈湴宸插畨瑁呮妧鑳?- [x] Phase 5.15.8: 缁熶竴 `openclaw.json` 鐪熸簮銆佽ˉ宸ヤ綔鍖烘寮忓绾︺€佷慨澶?Agent 璺緞瀹夊叏銆乷nboarding 澶辫触璇箟涓庨椤垫帶鍒跺彴 token 鎵╂暎

## Phase 5.16: Workspace 棰戦亾鍔熻兘杩佺Щ
- [x] 鍦?`workspace-clone` 棣栭〉鑱婂ぉ宸ヤ綔鍖鸿縼绉绘棫鐗堥閬撶洰褰曘€佺粦瀹氬脊绐椾笌 onboarding 浣撻獙锛屼繚鎸?legacy tabs 涓嶅彉
- [x] 鍦ㄩ椤甸閬撶洰褰曚腑灞曠ず 8 涓钩鍙板叆鍙ｏ紝骞朵负寰俊 / 椋炰功鎺ュ叆鐪熷疄缁戝畾閾捐矾
- [x] 涓?`DragonClaw2` 鏂板棰戦亾涓撶敤 Tauri commands銆佺被鍨嬩笌鍓嶇 API 灏佽锛屼繚鎸佷笌鏃т粨搴撳崗璁竴鑷?- [x] 璁╁凡缁戝畾棰戦亾鍦ㄩ椤靛鐢ㄥ搴?Agent 涓讳細璇濓紝鏈粦瀹氶閬撴樉绀虹┖鎬佸紩瀵?
## 2026-04-30 Pending Acceptance
- [ ] Phase 5.18: 鍩轰簬 `docs/design/DESIGN-elevenlabs.md` 寤虹珛鍏ㄥ眬 design token 搴曞骇锛岀粺涓€鍏变韩鏍峰紡鍏ュ彛锛屽苟灏嗗悗缁?UI 寮€鍙戠害鏉熶负浼樺厛浣跨敤 `src/styles/tokens.css`
- [ ] Phase 5.19: 灏?`workspace-clone` 浠庣嫭绔嬫祬钃?clone 瀛愪富棰樺叏閲忚縼绉诲埌 ElevenLabs 缁熶竴 token 涓庡搧鐗屼綋绯伙紝瑕嗙洊涓夋爮澹冲眰涓庣浉鍏?drawer / modal / popover / context menu
- [ ] 2026-05-03: 浼樺寲 `workspace-clone` 涓诲唴瀹瑰尯鍒囨崲鍔犺浇楠ㄦ灦涓烘洿瑙勬暣鐨勫浘 3 椋庢牸鍗＄墖锛屼笖涓嶅奖鍝嶆ā鍨嬮厤缃脊灞?- [x] 2026-05-02: update onboarding recommended skill installs to support the `opencli-agent` alias chain and add GitHub-based `html-ppt-skill`.
- [x] 2026-05-02: polish the workspace-clone skills modal so skill card hover/selection is fully visible, remove redundant Installed/Built-in row badges, and align built-in skill rows with the installed list styling.
- [x] 2026-05-02: align the workspace-clone skill detail and install-target popups with the memory modal reference so both use a denser header, panel layout, and less empty space without changing install behavior.
- [x] 2026-05-02: make workspace-clone skill market cards fully clickable like the employees roster cards, and compact the skill detail modal into a smaller single-column narrative layout.
- [x] 2026-05-02: unify the workspace-clone sidebar and directory collapse toggles, pin both to 25% divider height, and reveal them only on divider hover/focus.
- [x] 2026-05-02: reduce the shared custom window titlebar height to 45px and keep narrow-width layouts aligned with the same token source.
- [ ] 2026-05-02: compact the workspace-clone home suggestion cards so the scene card row takes less space above the composer.
- [ ] 2026-05-05: change the `workspace-clone` composer model pill to open a flat saved-model list first, and only open the model config modal from a dedicated 鈥渃onfigure custom model鈥?action.
- [ ] 2026-05-02: optimize the workspace-clone skill market install-target modal so its header hierarchy, multi-select cards, and footer actions feel denser and clearer without changing install behavior.
- [ ] Phase 5.25: support clickable history session switching in `workspace-clone`, replace raw session-key titles with frontend-derived first-intent summaries, and refine the history drawer to a compact title + time list with `鍏ㄩ儴 / 浠婂ぉ / 鏄ㄥぉ` filters.
- [ ] Phase 5.25.1: move `workspace-clone` session history caching to a local SQLite store so visited sessions switch instantly, survive app restarts, and refresh in the background without clearing the chat view first.
- [ ] Phase 5.15.13: add inline Markdown / JSON preview for assistant messages in `workspace-clone` chat, with auto-detect + JSON-first fallback and post-stream rendering only.
- [ ] Phase 5.24: add a live process timeline to `workspace-clone` chat, showing thinking, skill/tool calls, command execution, and step completion from existing gateway events without changing backend contracts.
- [ ] Phase 5.24.1: add a transient `鎬濊€冧腑` bridge in `workspace-clone` chat so completed tool/command steps are followed by visible processing feedback until the final assistant reply starts streaming.
- [ ] Phase 5.24.2: dedupe mirrored `agent` / `session.tool` live timeline entries in `workspace-clone` chat and upgrade running steps to a lightweight full-row sheen state.
- [ ] Phase 5.24.3: fix duplicate tool-call cards in `workspace-clone` chat by tightening frontend live-step dedupe semantics and guarding stale connection callbacks without changing gateway or `invoke()` contracts.
- [ ] 2026-05-02: refine the Phase 5.24.2 running sheen so it feels closer to Codex, with a continuous transparency loop instead of a single obvious light block sweep.
- [ ] 2026-05-02: raise the live sheen visibility further so the animation reads clearly instead of getting washed out by subtle styling or shorthand overrides.
- [ ] 2026-05-02: strengthen the Phase 5.24.2 running sheen again so the motion reads clearly from left to right, closer to Codex's directional live-processing glow.
- [ ] 2026-05-02: correct the running sheen's perceived direction so it clearly reads left-to-right, with a brighter head and a longer trailing glow.
- [ ] 2026-05-02: fix the running sheen's perceived direction by making the asymmetric highlight read unambiguously left-to-right instead of visually reversing.
- [x] Phase 5.17.2: fix startup white-screen by showing an immediate boot splash and lazy-loading ready-page modules/styles without changing startup business logic.
- [ ] Phase 5.22: sync DragonClaw scene cards into `workspace-clone > chat > agents`, including grouped scene cards, case drill-down, composer prefills, per-session open-state persistence, and welcome-state card compaction without changing backend contracts.
- [ ] 2026-05-02: refresh the workspace-clone sidebar footer buttons into a reference-style identity card with a trailing utility action, without changing existing frontend behavior.
- [ ] Phase 5.21: sync DragonClaw skill market into `workspace-clone > skills`, including market browse/search/detail, multi-Agent install targets, and current-Agent skill visibility refresh.
- [x] Phase 5.17.3: replace the blue first-paint boot splash with a compact 200x200 logo loading page, unify the later startup overlay, and tone down onboarding colors to match the ElevenLabs theme tokens.
- [ ] Phase 5.15.10: remove native Windows titlebar and restore custom titlebar window controls permissions/behavior
- [ ] 2026-04-30: remove workspace-clone chat header subtitle text under the avatar.
- [x] 2026-05-02: retire the legacy console shell, remove all frontend `open_console` entry points, and delete the unused Tauri `open_console` command after regression checks.
- [x] 2026-04-30: fix weixin QR binding readiness/response normalization regression so installed/enabled plugins skip blocking revalidation and generated `qr_url` renders in the binding modal.
- [x] 2026-04-30: align workspace-clone weixin QR binding with DragonClaw fallback flow, including CLI login fallback and automatic Agent binding after scan success.
- [x] 2026-05-01: move the workspace-clone sidebar collapse toggle onto the divider edge between the menu rail and directory rail.
- [x] 2026-05-01: center the workspace-clone sidebar edge toggle on the divider and reveal it only on edge hover/focus.
- [x] 2026-05-01: move the workspace-clone primary sidebar menu upward by removing the empty topbar spacing.
- [x] 2026-05-01: align the primary sidebar menu top edge with the directory search box top edge.
- [x] 2026-05-02: remove the translucent DragonClaw logo watermark from the bottom of the workspace-clone sidebar rail.

## Phase 5.20: Workspace 鏁板瓧鍛樺伐瑙掕壊搴撳悓姝?- [x] 鍦?`workspace-clone > employees` 鍚屾鏃т粨搴?DragonClaw 鐨勬暟瀛楀憳宸ヨ鑹插簱锛岃ˉ榻愬垎绫汇€佹悳绱€佸姞鍏ャ€佸凡鍔犲叆鍒楄〃涓庣Щ闄ゅ嵏杞斤紝骞舵柊澧?`install_agency_agent` / `uninstall_agency_agent` / `load_installed_agency_agent_ids` 鍛戒护

- [ ] Phase 5.15.12: fix the borderless window maximize display so double-click maximize keeps a safe frame inset and no longer clips the custom titlebar or workspace content on Windows.
## Phase 5.23: OpenClaw CLI PATH 鏆撮湶涓庨€€鍑轰繚娲?- [ ] 2026-05-02: expose `openclaw` into the current user PATH during setup, keep OpenClaw running when DragonClaw exits from tray quit, and reuse that existing service on the next launch.
## Phase 5.26: 鍏ㄩ」鐩秷鎭彁绀虹粺涓€涓洪《閮ㄥ眳涓诞灞?- [ ] 2026-05-03: add a shared top-center feedback center for result-style prompts and actionable errors, migrate App / setup / workspace-clone notices into it, and retire inline banners, modal status strips, and the legacy bottom repair toast.
## Phase 5.28: 寮曞瀹夎涓庡惎鍔ㄩ摼璺幓闃诲鍖?- [x] 2026-05-03: move setup, service prebuild, and onboarding heavy local work off UI-related command threads so the launcher stays responsive during install and first-run startup.
## Phase 5.30: Homepage Lazy Data Loading
- [ ] Limit ready homepage eager data to chat essentials; lazy load logs, history title backfill, channels, memory, skills, tools, model config, drawers, and modals after user interaction

- [ ] Phase 5.20.1: fix `workspace-clone > employees` install/remove roster refresh so chat agent directory, channel-binding agent picker, and local cached/offline roster stay in sync without changing Tauri command signatures or frontend `invoke()` contracts.

## Phase 5.31: Homepage Chat Freeze Fix
- [ ] Fix ready homepage chat freezes by guarding gateway reconnect loops, deduplicating initial history loads, lazy-loading markdown rendering, and batching high-frequency log updates.
- [ ] 2026-05-03: remove the highlighted placeholder tool icons plus the `璁板繂` and `鎶€鑳藉簱` pills from the `workspace-clone` chat composer without changing command/model/send behavior.
## Phase 5.43b: `workspace-clone` 澶村儚璋冩暣鍔熻兘杩佺Щ
- [ ] 灏嗘棫浠撳簱澶村儚璋冩暣鑳藉姏杩佺Щ鍒?`workspace-clone > chat > agents`锛屾敮鎸侀璁惧ご鍍忋€佽嚜瀹氫箟涓婁紶銆佹仮澶嶉粯璁わ紝骞朵娇鐢ㄥ墠绔湰鍦板瓨鍌ㄦ寔涔呭寲瑕嗙洊缁撴灉涓斾笉鏀瑰姩浠讳綍 Tauri command / `invoke()` 濂戠害銆?## Phase 5.48: Workspace 澶村儚寮圭獥淇涓庨粯璁ゅご鍍忓垎閰?- [ ] 淇 `workspace-clone` 鑱婂ぉ鍥炲澶村儚鎷変几瑁佸垏銆佸ご鍍忓脊绐楁樉绀轰笉鍏ㄤ笌鑻辨枃鏂囨娈嬬暀锛屽苟涓烘柊鍔犲叆鐨勬暟瀛楀憳宸ュ湪鏃犺嚜甯﹀ご鍍忔椂鎸?`agentId` 绋冲畾鍒嗛厤榛樿鎻掔敾澶村儚锛屼笉鏀逛换浣?Tauri command / `invoke()` 濂戠害銆?
