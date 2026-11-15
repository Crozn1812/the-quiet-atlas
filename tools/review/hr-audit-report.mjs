// Human observations, entered only after opening the captured originals.
// Re-run after all three capture passes and gates.json are complete.
import { readFile, writeFile, copyFile, stat, access } from "node:fs/promises";
import path from "node:path";
import { sharp } from "./luma.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const dest = path.join(root, "test-results/hr-audit");
const read = file => readFile(path.join(dest, file), "utf8").then(JSON.parse);
const main = await read("capture-manifest.json");
const supplement = await read("supplement/capture-manifest.json");
const match = await read("horizon-match/capture-manifest.json");
for (const run of [main, supplement, match]) {
  if (run.head !== main.head || !run.status.startsWith("captured-")) throw new Error("Incomplete or mismatched capture run");
}
const shots = [main, supplement, match].flatMap((run, index) => run.captures.map(s => ({
  ...s, visualReview: "reviewed", file: ["", "supplement/", "horizon-match/"][index] + s.file,
})));
const byId = new Map(shots.map(s => [s.id, s]));
const findings = [];
const issue = (id, severity, subject, evidence, observation, sources) => findings.push({ id, severity, subject, evidence: evidence.split(" "), observation, sources: sources.split(" ") });
issue("A02", "cao", "Sườn xa / đường ghép địa hình Old Trail", "old-trail-overview old-trail-close old-trail-path horizon-left-holes", "Mảng sườn phía sau cây trắng thành các tam giác lớn, có cạnh chéo thẳng cắt màu xanh của núi. Không chỉ là bóng cây hay texture đá; vùng sáng kéo dài liên tục phía sau thân cây.", "scene/far-landscape.ts scene/far-material.ts terrain/mesh.ts post/aerial.ts");
issue("A03", "cao", "Cây xa, viền tán và sương", "first-light-overview roots-overview old-trail-path horizon-left-holes quiet-shore-overview", "Nhiều tán/thân xa thành silhouette xanh trắng rất nhạt với chấm đen và mép lấm tấm; có cây gần tối cạnh cây xa gần như trắng. Mất thể tích rõ trên ảnh gốc 1600×900.", "foliage/hr-material.ts foliage/hr-runtime.ts scene/far-forest.ts post/aerial.ts");
issue("A04", "cao", "Cỏ ven đường và nền khu", "first-light-close old-trail-close horizon-close quiet-shore-path last-postcard-overview", "Lá cỏ là các dải/tam giác màu đồng nhất, nhiều bụi chữ V giống nhau với khoảng cách đều. Dải cỏ phủ nền thành hàng/ô, đặc biệt tại bờ biển và đồi Horizon.", "foliage/ground.ts zones/hr-props-dressing.ts props/hr-props.ts");
issue("A05", "cao", "Props chính và bụi authored First Light", "first-light-close first-light-path character-2", "Cột đỡ sách, ghế/khúc gỗ, đá cạnh cột và bụi xanh lớn vẫn là khối cạnh thẳng, các mặt màu trơn nâu/xanh đậm; texture nền chi tiết làm độ chênh càng rõ.", "zones/first-light.ts foliage/first-light-grove.ts props/hr-structures.ts");
issue("A06", "cao", "Lửa / tia lửa Workshop", "workshop-close workshop-path", "Ngọn lửa là khối nhọn vàng có mặt đa giác lớn; các tia lửa là viên hình thoi, bệ dưới gần như đen trơn. Chưa giống lửa thật ở cả toàn cảnh và cận.", "zones/workshop.ts");
issue("A07", "cao", "Hai cầu gỗ", "bridge-1 bridge-2", "Sàn, cột và tay vịn là các thanh nâu trơn, không thấy thớ gỗ hay chi tiết liên kết; lộ mặt và nhịp thanh lặp đều. Mảng rêu là vệt xanh phẳng.", "bridges/index.ts bridges/geometry.ts materials/ramp.ts");
issue("A08", "cao", "Nhân vật khi đứng và lái", "supplement/character-close supplement/vehicle-riding-close", "Mặt trơn, tai/mũi tối giản, tóc thành các búi đen, khớp tay/chân chia đoạn, áo trắng ít nếp và giày xanh màu khối. Silhouette và vật liệu còn rõ phong cách hoạt hình ở High.", "character/loader.ts character/baked-appearance.ts");
issue("A09", "cao", "Cỏ xuyên sàn Quiet Shore", "quiet-shore-close", "Nhiều lá cỏ nhô xuyên mặt ván sàn bên dưới đàn piano và ghế; thấy được cả lá đi qua mép sàn phía trước.", "zones/quiet-shore.ts zones/quiet-shore-dressing.ts foliage/ground.ts");
issue("A10", "vừa", "Thân cây đen sát First Light", "first-light-close first-light-path character-2", "Một số thân/cành gần đen trơn, mặt thân phẳng và góc chạc sắc, ngay cạnh những cây có vân vỏ. Chênh lệch không chỉ nằm ở cây xa.", "zones/first-light.ts foliage/first-light-grove.ts materials/ramp.ts");
issue("A11", "vừa", "Vỏ/rễ cây Roots", "roots-close roots-up roots-path", "Vân vỏ phóng lớn, mờ/kéo dọc trên thân; chân thân kết thúc bằng nhiều đoạn cạnh thẳng kiểu răng cưa, rễ ngang có mặt rộng và mép cứng. Không ghi lơ lửng vì ảnh không chứng minh điều đó.", "zones/roots-tree.ts zones/roots.ts");
issue("A12", "vừa", "Cột, xà, mặt bàn và mái Workshop", "workshop-overview workshop-close workshop-up", "Các mặt gỗ phủ vân loang thô như vỏ cây/đá, thiếu thớ ván theo chiều; mái là mảng nâu/xanh đen ít chi tiết bề mặt. Mặt gần lộ chỗ đổi mật độ vân.", "zones/workshop.ts props/hr-structures.ts");
issue("A13", "vừa", "Đèn lồng và rêu Old Trail", "old-trail-close old-trail-path", "Đèn lồng dùng hình nón/ống nhiều cạnh màu đen vàng trơn; rêu trên lan can thành các mảng xanh dày có mép đa giác.", "zones/old-trail.ts");
issue("A14", "vừa", "Ống nhòm và turbine Horizon", "horizon-close horizon-path", "Miệng ống nhòm lục giác, thân/trụ trắng đen phẳng, không thấy chi tiết kính. Turbine trắng đơn giản, không có chi tiết khớp/vật liệu ở khoảng nhìn từ đường.", "zones/horizon.ts");
issue("A15", "vừa", "Piano, guitar, ghế và khung chòi Quiet Shore", "quiet-shore-close", "Đàn/ghế vẫn dùng các mặt phẳng lớn, phím đàn dạng khối; vân trên thân đàn và cột giống cùng một vân loang thô. Mặt mái tối và mép sàn rất cứng.", "zones/quiet-shore.ts props/hr-structures.ts");
issue("A16", "vừa", "Hộp thư, đèn, bưu thiếp Last Postcard", "last-postcard-close last-postcard-path", "Mái hộp thư gãy thành vài cạnh lớn, thân xám trơn; đèn vàng khối, bưu thiếp là các hình chữ nhật màu cyan/xanh và ô cam phẳng, ít chi tiết vật liệu.", "zones/last-postcard.ts");
issue("A17", "vừa", "Biển chỉ đường ở các khu", "signpost roots-path quiet-shore-path", "Mặt biển và cọc là màu ô liu trơn, thiếu thớ gỗ và mòn cạnh; cận cảnh rất giống tấm đồ họa phẳng. Một số pose từ đường bị biển tiền cảnh che — đó là hạn chế framing, không gọi là lỗi camera gameplay.", "props/shapes.ts props/index.ts props/lettering.ts");
issue("A18", "vừa", "Cá First Light / Roots", "fish-roots supplement/fish-first-light-wide", "Cá hiện thành bóng xanh đặc với đuôi/vây tam giác; không thấy mắt, vảy hoặc khác biệt bề mặt. Hình đồng dạng rất rõ khi cả đàn vào khung.", "water/fish-shader.ts water/fish.ts");
issue("A19", "vừa", "Mặt suối, cây thủy sinh và đáy", "stream-wide stream-close", "Sóng thành các vạch ngang gần song song và đều trên toàn bề rộng; cây thủy sinh là lá xanh trơn đứng đơn chiếc. Đá có texture nhưng nền/lá chưa tạo được mức chi tiết tự nhiên tương xứng.", "water/material.ts water/streambed-geometry.ts water/streambed-shader.ts");
issue("A20", "vừa", "Bọt sóng / mép biển", "sea-wide supplement/surf-shore last-postcard-overview", "Dải trắng sáng chạy theo bờ thành đường dày gần liên tục, có đoạn gấp khúc; phần nước sát bờ như mảng màu phủ. Ảnh close ban đầu sea-surf không đủ thấy bờ, dùng surf-shore để xác nhận.", "shore/surf.ts water/material.ts water/sea.ts");
issue("A21", "vừa", "Lan can và cọc đường ven biển", "road-railing road-surface last-postcard-path", "Thanh xám, cọc trắng và dải đỏ đều màu, các module gần giống hệt nhau; mép vuông sạch và ít chi tiết hao mòn/ốc nối ở cận đường.", "road/railing.ts road/geometry.ts road/posts.ts");
issue("A22", "vừa", "Núi xa / sườn ven biển", "old-trail-path quiet-shore-overview sea-wide", "Các dải xanh/trắng lớn mềm như tô màu, đỉnh gãy cạnh, sườn thiếu chi tiết địa chất/rừng so với nền gần. Sườn ven biển có ranh giới chéo thẳng sáng/tối.", "scene/far-landscape.ts scene/far-relief.ts scene/far-material.ts");
issue("A23", "vừa", "Vách và dòng thác đầu suối", "signpost first-light-overview character-1", "Vách có vân kéo thành dải uốn ngang/dọc rất lớn, ít độ sắc của đá; dòng nước chảy ra là dải xanh có cạnh rõ, điểm đổ xuống thành các lớp mặt phẳng. Ảnh không đủ kết luận về animation.", "terrain/spring.ts zones/first-light-cliff.ts zones/first-light-cliff-detail.ts");
issue("A24", "vừa", "Xe High khi lái", "supplement/vehicle-riding-close supplement/vehicle-detail", "Mesh xe đã có nan hoa/lò xo/đèn chi tiết hơn nền props, nhưng gương là đĩa đen, chắn bùn/sơn trắng khá trơn và vật liệu da/sơn chưa có biến thiên nhỏ nhìn thấy. Không thấy xuyên tay rõ trong các ảnh này.", "vehicle/hr-runtime.ts character/baked-appearance.ts");
issue("A25", "vừa", "Chim và cành đậu", "supplement/bird-perch supplement/bird-perch-2", "Thân chim có mảng lông nâu/kem và mắt rõ, nhưng bề mặt bụng/lưng rất mịn như nhựa, cánh/đuôi là các lá dài ít chi tiết. Cành gần là ống trơn không vân vỏ.", "fauna/geometry.ts fauna/perches.ts");
issue("A26", "thấp", "Tượng/chứng chỉ Milestones", "supplement/certificates-chest milestones-close", "Chữ chứng chỉ đọc được, vật liệu sứ sáng và đường nứt vàng rõ; mặt/tóc của tượng vẫn là hình nhân hoạt hình và đế xanh lộ mặt lớn. Hốc rỗng, mảnh bay, vòng sáng là thiết kế hiện có, không được ghi thành lỗi lơ lửng/xuyên.", "zones/milestones-statue.ts zones/milestones-statue-geometry.ts zones/milestones.ts");

// Each note refers to visible evidence, or explicitly records a coverage limit.
const notes = {
  "first-light-overview": ["A03 A04 A05 A10 A23", "Props/bụi màu phẳng bên phải; cây xa lấm tấm; vách trái vân lớn."],
  "first-light-close": ["A04 A05 A10", "Cột sách, ghế, bụi và thân đen vào rõ khung cận."],
  "first-light-up": ["A03", "Tán rất dày, lá nhỏ đè lớp tối; viền có răng/lấm tấm. Không thấy lỗi mới khác đủ chắc."],
  "first-light-path": ["A03 A04 A05 A10 A17", "Biển, cỏ, props và thân cây gần đều thấy từ đường."],
  "workshop-overview": ["A04 A06 A12 A17", "Cổng và bàn giữa khung; lửa màu khối, mái trơn."],
  "workshop-close": ["A04 A06 A12", "Ngọn lửa đa giác chiếm hai cạnh; mặt bàn và khung có vân loang."],
  "workshop-up": ["A12", "Tán/sky và mép mái tối bên phải; không thấy lỗi bố trí mới."],
  "workshop-path": ["A03 A04 A06 A12 A17", "Biển tiền cảnh che trái nhưng bàn/lửa vẫn rõ; ghi giới hạn framing."],
  "roots-overview": ["A03 A11 A17", "Bảng Skills đọc được; vỏ cây và mép rễ vào khung; cây phía đối diện bị trắng."],
  "roots-close": ["A11", "Vỏ thân mờ ở cận, chân gãy thành đoạn thẳng."],
  "roots-up": ["A11", "Cành to có vân kéo theo bề mặt; tán phía sau dày và tối."],
  "roots-path": ["A03 A11 A17", "Rễ ngang, vỏ thân và đá nhỏ cạnh đường; biển che góc trái."],
  "milestones-overview": ["A03 A04 A26", "Tượng toàn thân thấy đủ, đế xanh đơn giản; không quy kết vòng bay là lỗi."],
  "milestones-close": ["A26", "Góc gần 3 m chỉ thấy chân/đế; bổ sung certificates-chest để xem chứng chỉ."],
  "milestones-up": ["", "Tán cây/sky và một phần đầu tượng ở góc phải; không có lỗi mới đủ chắc trong góc này."],
  "milestones-path": ["A03 A04 A17 A26", "Thân tượng và chữ chứng chỉ nhìn được; biển tiền cảnh che một phần."],
  "old-trail-overview": ["A02 A03 A04 A13 A22", "Hàng rào/đèn và các mảng tam giác sáng rất lớn trên sườn xa."],
  "old-trail-close": ["A02 A03 A04 A13", "Đèn vàng đen, rêu xanh khối và cỏ lặp cụm hiện rõ."],
  "old-trail-up": ["", "Chim trên nền trời; ở kích thước này không đủ kết luận lỗi anatomy/lông."],
  "old-trail-path": ["A02 A03 A04 A13 A17 A22", "Sườn trắng, cây lấm tấm, hàng rào và cỏ từ đường."],
  "horizon-overview": ["A03 A04 A14", "Ống nhòm, ghế và turbine, sườn trống; hướng này không bao sườn trái Lead báo."],
  "horizon-close": ["A04 A14", "Miệng ống lục giác và trụ đen vào rõ khung."],
  "horizon-up": ["", "Đàn chim và trời; không có lỗi mới đủ chắc ở góc này."],
  "horizon-path": ["A03 A04 A14 A17", "Ống nhòm và turbine nhìn từ đường; lá cỏ lặp nhiều cụm."],
  "quiet-shore-overview": ["A03 A04 A15 A20 A22", "Chòi ven đường, sườn xa chéo trắng và bọt sóng liên tục."],
  "quiet-shore-close": ["A04 A09 A15", "Piano/guitar/cột sàn hiện rõ; lá cỏ xuyên sàn."],
  "quiet-shore-up": ["", "Chim biển trên nền trời; cánh tách lông nhìn được nhưng chưa đủ để chấm cận."],
  "quiet-shore-path": ["A04 A15 A17 A22", "Biển che phần trái dưới; vẫn thấy chòi, cỏ và sườn xa."],
  "last-postcard-overview": ["A04 A16 A20 A21", "Hộp thư, hàng rào và bờ sóng; cỏ phủ thành lưới."],
  "last-postcard-close": ["A16", "Hộp thư, đèn và bưu thiếp trơn/cạnh rõ ở cận."],
  "last-postcard-up": ["", "Mây và một phần chim ở mép dưới; không có lỗi mới đủ chắc."],
  "last-postcard-path": ["A04 A16 A17 A21", "Hàng rào và hộp thư từ đường; biển tiền cảnh che một phần."],
  "stream-wide": ["A03 A19", "Mặt suối gợn song song, đáy nhiều đá, lá thủy sinh đơn sắc."],
  "stream-close": ["A19", "Lá xanh đơn chiếc và vạch sóng đều; đá có texture, không gọi tất cả đá là low-poly."],
  "sea-wide": ["A20 A22", "Biển trong vịnh, bọt trắng liên tục và sườn trơn xa."],
  "sea-surf": ["", "Chỉ thấy nước giữa vịnh, không đủ coverage mép sóng; dùng surf-shore bổ sung."],
  "road-surface": ["A04 A21", "Asphalt có vân/nứt và vạch nhìn được; cỏ module và cọc/lan can trơn. Không ghi lỗi texture đường chưa thấy."],
  "road-railing": ["A04 A21", "Lan can/cọc cùng màu lặp; ranh cỏ hàng rõ."],
  "bridge-1": ["A03 A07 A19", "Cầu 1 toàn phần gần, ván/tay vịn nâu phẳng."],
  "bridge-2": ["A07 A19", "Cầu 2 cùng vật liệu màu phẳng, đáy nước nhìn rõ."],
  "signpost": ["A17 A23", "Biển trước vách và nguồn suối; có dòng thác dạng dải xanh cạnh rõ."],
  "certificates": ["A26", "Góc chĩa chân thay vì chứng chỉ; giữ bằng chứng và bổ sung ảnh ngang thân."],
  "fish-first-light": ["", "Không nhận ra cá đủ chắc trong góc hẹp này; đã bổ sung ảnh toàn hành lang có cá."],
  "fish-roots": ["A18", "Ba cá ở nửa dưới, thân/vây xanh đặc."],
  "birds": ["", "Hai chim bay nhìn được; camera gần lá nên không dùng khung này chấm anatomy. Dùng ảnh chim đậu."],
  "horizon-left-holes": ["A02 A03", "Thấy sườn mảng trắng và cây lấm tấm; chưa nhận ra lỗ tròn như ảnh Lead trong hướng này."],
  "character-1": ["A05 A08 A23", "Nhân vật thấy toàn thân nhưng nhỏ; dùng character-close để chấm vật liệu."],
  "character-2": ["A05 A08 A10", "Nhân vật cạnh xe nhìn nghiêng; props và thân đen thấy rõ."],
  "character-3": ["A08", "Nhân vật từ phía trước; vẫn nhỏ, có bổ sung cận."],
  "vehicle-parked": ["A08 A24", "Xe dựng rõ silhouette, chưa đủ nhìn vật liệu nhỏ; bổ sung vehicle-detail."],
  "vehicle-riding": ["A08 A24", "Đang ride, có tiến về trước trong khoảng mẫu; bổ sung góc gần."],
  "low-first-light": ["", "Đối chiếu Low cùng camera First Light overview: tán khối và nền rẻ hơn. Không dùng Low để ghi lỗi High."],
  "horizon-gameplay": ["A03 A04 A14", "Góc gameplay nhìn suối hơi chúc xuống, không khớp ảnh Lead; đã thêm pass đúng pose."],
  "certificates-chest": ["A26", "Chữ CCNA/VTI DEVOPS rõ, mặt và tóc tượng tối giản. Hốc rỗng là thiết kế."],
  "bird-perch": ["A25", "Chim nâu đậu rõ mắt, mảng má; bụng/lưng mịn và cành trơn."],
  "bird-perch-2": ["A25", "Chim đen trắng đậu, cùng hạn chế bề mặt; không khẳng định lỗi chân chỉ từ ảnh này."],
  "surf-shore": ["A20", "Đã thấy đúng giao bờ; dải bọt trắng đều màu rất rõ."],
  "fish-first-light-wide": ["A18", "Cá hiện đủ trong nửa dưới ảnh toàn hành lang, xác nhận coverage First Light."],
  "character-close": ["A08", "Mặt/tóc/khớp, áo và giày nhìn gần bằng camera gameplay."],
  "vehicle-detail": ["A08 A24", "Xe dựng nhìn gần, có cỏ che bánh dưới; ảnh ride gần bổ sung mặt trước."],
  "vehicle-riding-close": ["A08 A24", "Xe và người nhìn trước khi chạy, gương đen và chắn bùn/sơn trơn."],
};

// The matched Horizon observations are filled only after inspecting that pass.
const extraNotes = await read("horizon-review.json");
Object.assign(notes, extraNotes.notes);
findings.unshift(...extraNotes.findings);
for (const s of shots) {
  if (!notes[s.id]) throw new Error(`Unreviewed: ${s.id}`);
  const metadata = await sharp(path.join(dest, s.file)).metadata();
  if (metadata.width !== 1600 || metadata.height !== 900) throw new Error(`Wrong viewport: ${s.id}`);
}
for (const f of findings) {
  // Allow data to name a shot as supplement/id for readability.
  f.evidence = f.evidence.map(id => id.replace(/^supplement\//, ""));
  for (const id of f.evidence) if (!byId.has(id)) throw new Error(`Missing evidence: ${id}`);
  for (const file of f.sources) await access(path.join(root, "src/features/world", file));
}
for (const [id, [refs]] of Object.entries(notes)) for (const ref of refs.split(" ").filter(Boolean)) {
  if (!findings.some(f => f.id === ref)) throw new Error(`${id}: unknown finding ${ref}`);
}
await copyFile(path.join(root, "tmp/hr-sky/return1/comparison-horizon.webp"), path.join(dest, "lead-comparison-horizon.webp"));
const review = { head: main.head, reviewedAt: new Date().toISOString(), status: "reviewed", findings,
  images: shots.map(s => ({ id: s.id, file: s.file, findings: notes[s.id][0].split(" ").filter(Boolean), observation: notes[s.id][1], visualReview: "reviewed" })) };
await writeFile(path.join(dest, "review.json"), JSON.stringify(review, null, 2));
const esc = s => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const coord = p => p ? `(${p.map(n => n.toFixed(2)).join(", ")})` : "gameplay";
const location = s => `${s.zone}; ${s.target ? "T " + coord(s.target) : "P " + coord(Object.values(s.actualPlayer))}`;
const imageLink = id => { const s = byId.get(id); return `[${id}](../../test-results/hr-audit/${s.file})`; };
const sourceLink = file => `[${file}](../../src/features/world/${file})`;
const sorted = [...findings].sort((a, b) => ["cao", "vừa", "thấp"].indexOf(a.severity) - ["cao", "vừa", "thấp"].indexOf(b.severity));
const findingRows = sorted.map(f => {
  const s = byId.get(f.evidence[0]);
  return `| ${f.id} / **${f.severity}** | ${f.subject}; ${location(s)} | ${f.observation} ${f.evidence.map(imageLink).join(" · ")} | ${f.sources.map(sourceLink).join(" · ")} |`;
}).join("\n");
const angleRows = shots.map(s => `| ${imageLink(s.id)} | ${s.quality} | ${s.zone}; C ${coord(s.position)}; ${s.position ? "T " + coord(s.target) : "P " + coord(Object.values(s.actualPlayer))} | ${s.renderedFps.toFixed(1)} / ${s.fps.toFixed(1)} | ${notes[s.id][0] || "—"}; ${notes[s.id][1]} |`).join("\n");
const high = shots.filter(s => s.quality === "high");
const range = (samples, key, digits = 0) => `${Math.min(...samples.map(s => s[key])).toFixed(digits)}–${Math.max(...samples.map(s => s[key])).toFixed(digits)}`;
const zoneRows = main.layout.zones.map(z => {
  const samples = shots.filter(s => s.zone === z.id && s.quality === "high");
  const core = ["overview", "close", "up", "path"].map(a => byId.get(`${z.id}-${a}`).renderedFps.toFixed(1));
  return `| ${z.id} | ${core.join(" / ")} | ${range(samples, "trianglesAllPasses")} | ${range(samples, "drawCallsAllPasses", 1)} | ${range(samples, "cpuTaskMsPerSecond", 1)} |`;
}).join("\n");
const gates = await read("gates.json");
const gateRows = gates.map(g => `| \`${g.command}\` | ${g.status}; exit ${g.exitCode} | ${g.summary} | [log](../../test-results/hr-audit/${g.log}) |`).join("\n");
const bytes = (await Promise.all(shots.map(s => stat(path.join(dest, s.file))))).reduce((n, s) => n + s.size, 0);
const report = `# HR-AUDIT — rà ảnh High tại main ${main.head.slice(0, 7)}

[Gallery xem nhanh](../../test-results/hr-audit/index.html) · [review + findings JSON](../../test-results/hr-audit/review.json) · [manifest chính](../../test-results/hr-audit/capture-manifest.json) · [bổ sung](../../test-results/hr-audit/supplement/capture-manifest.json) · [khớp pose Lead](../../test-results/hr-audit/horizon-match/capture-manifest.json)

Ngày 2026-11-15, slot W-C, HEAD = main = \`${main.head}\` lúc bắt đầu. Build WASM/webpack **một lần**, serve \`http://127.0.0.1:4203\`. **${shots.length} ảnh mới đã mở xem: ${high.length} High + 1 Low**, không tính ảnh Lead cũ. Đủ 8 khu × 4 góc và các chủ thể bổ sung; góc cận chính cách target khoảng 3 m. ${findings.length} nhóm bên dưới gồm **25 nhóm quan sát hiện tại và 1 mục lịch sử chưa tái hiện (A01)**, dùng làm backlog art, **không phải nghiệm thu đạt siêu thực**. Không sửa world/asset/content, không commit.

## Môi trường và cách đọc bằng chứng

Edge headed 157, 1600×900, DPR 1; WebGL2 GPU thật: \`${main.gpu.renderer}\`. Chọn High thủ công qua menu, xác nhận quality và unpaused ở từng ảnh; không SwiftShader cho ảnh/FPS. Mỗi góc chờ network idle + 3,5 s, đo 3 s rồi chụp WebP quality 94 nguyên 1600×900. Build, lint, unit và e2e của phiên đều **không chạy đồng thời lúc đo ảnh**; tải worker khác trên máy không được cô lập. Đây là số đo phiên audit, không dùng để kết luận benchmark độc lập.

Tọa độ tính bằng mét, C = camera, T = điểm nhìn/interaction target, P = người chơi. T là mốc để tìm vật trong khung, **không phải tọa độ từng lỗi pixel hoặc lỗ trên mesh xa**; xem C/T đầy đủ ở bảng ảnh/manifest và mở ảnh ở 100%. Mã/asset được ghi là **nghi nguồn**, chưa có phép tách render để chứng minh nguyên nhân. Không gán mọi lỗi alpha cho impostor: cây xa hiện tại còn có geometry lá thật. Raw capture-manifest giữ trạng thái lúc chụp; trạng thái đã rà ảnh nằm trong review.json và gallery tổng.

## Bảng lỗi theo mức độ

| ID / mức | Vật và vị trí | Điều nhìn thấy + bằng chứng | Nguồn nghi liên quan |
|---|---|---|---|
${findingRows}

## Lỗi lỗ tròn Lead báo

${extraNotes.discussion}

[Ảnh Lead lưu cùng bàn giao](../../test-results/hr-audit/lead-comparison-horizon.webp), hàng 3: MAIN 19e90fa và HR-SKY đều có mảng tròn màu trời bên trái. Đây là revision cũ, không tính vào ${shots.length} ảnh hiện tại. Pose khớp lấy từ \`tmp/hr-sky/return1/before/poses.json\`: C (32.40448, 5.06980, -408.21997), T (32.40448, 5.06980, -441.21997); hai ảnh kế dịch cả C/T theo x ±0,6 m. Không sửa shader, không tắt lớp mesh để chụp.

## Số đo

FPS dưới đây là **frame có WebGL draw / callback rAF**. rAF đơn thuần không được coi là số frame world render. Tam giác và draw là trung bình mỗi frame có draw, **mọi pass** (scene/shadow/post), không đồng nhất với renderer.info ở pass cuối. CPU là CDP main-thread TaskDuration ms/s, không gồm GPU hoặc worker decode. Raw từng góc ở các manifest và [measurements chính](../../test-results/hr-audit/measurements.md).

| Khu | FPS render overview / close / up / path | Tam giác/frame mọi góc High | Draw/frame mọi góc High | CPU task ms/s |
|---|---|---:|---:|---:|
${zoneRows}

| Hạng mục | Kết quả |
|---|---|
| FPS High toàn bộ góc | ${range(high, "renderedFps", 1)} FPS render; rAF ${range(high, "fps", 1)} |
| Low cùng pose First Light overview | ${byId.get("low-first-light").renderedFps.toFixed(1)} FPS render; không suy ra Low mọi khu |
| Byte asset thêm | **0**; không sửa public/assets |
| Byte tải phiên chính | ${main.responseBytes.toLocaleString("en-US")} response-body bytes toàn phiên, gồm trang/world/textures, không phải byte tăng thêm |
| Enter → intro done (proxy chơi được), pass bổ sung | ${supplement.enterToPlayableIntroDoneMs} ms; QA bỏ intro, không phải first input latency benchmark |
| Enter → deferred build done, phiên chính | ${main.enterToBuildDoneMs} ms; ${main.enterToBuildDoneBytes.toLocaleString("en-US")} response-body bytes đã nhận tại mốc đó |
| Kích thước ${shots.length} ảnh mới | ${bytes.toLocaleString("en-US")} bytes; ảnh Lead riêng 882.518 bytes |
| CPU ABBA | NOT RUN: không có thay đổi code hay cặp bật/tắt tính năng trong ticket audit |
| Page error / failed request | Chính ${main.errors.length}/${main.failedRequests.length}; bổ sung ${supplement.errors.length}/${supplement.failedRequests.length}; khớp Lead ${match.errors.length}/${match.failedRequests.length} |
| Trước/sau | Không có before/after sửa world trong ticket này; Low cùng pose là đối chiếu quality, ảnh Lead cũ là bằng chứng lịch sử |

## Kiểm từng ảnh và FPS

Các ID Axx tham chiếu bảng lỗi (kèm mức độ, nguồn); dấu — nghĩa là không phát hiện mới đủ chắc hoặc thiếu framing, không phải art PASS. Ảnh chim/cá được xem trực tiếp để xác nhận chúng nằm trong khung. Ảnh cận chứng chỉ ban đầu nhìn chân; ảnh bổ sung nhìn ngang thân. Gameplay đang lái được script xác nhận state manual/cruise và giữ W trong khoảng đo/chụp. Các ảnh from-path có biển tiền cảnh che một phần được giữ nguyên và ghi giới hạn; không gán đó là lỗi camera của người chơi.

| Ảnh / vật | Quality | Khu + tọa độ | FPS render / rAF | Quan sát |
|---|---|---|---:|---|
${angleRows}

## Gate và bàn giao

| Lệnh | Kết quả | Dòng tổng kết | Output |
|---|---|---|---|
${gateRows}

\`node --check\` cho cả ba script audit: PASS, exit 0. Script report xác minh đủ 64 ảnh nguyên 1600×900 và các link source/evidence tồn tại. Một lượt lint trong lúc e2e đang chạy đã quét JS trace tạm của Playwright (4 errors, 224 warnings, không phải source audit); giữ log ở [lint-during-e2e.log](../../test-results/hr-audit/lint-during-e2e.log). Sau khi e2e hoàn tất/dọn trace, \`pnpm lint\` chạy lại **PASS, 0 warning**, không đổi config hay rule.

File sửa/thêm: \`tools/review/hr-audit.mjs\` (tiếp tục script đã chép, đổi 4203, thêm pass bổ sung/khớp pose), \`tools/review/hr-audit-layout.mjs\` (tọa độ từ source, thêm giao bờ), \`tools/review/hr-audit-report.mjs\` (ghi nhận review thủ công + tạo bảng/gallery, kiểm kích thước/link), \`tests/review/HR-AUDIT.md\`, \`test-results/hr-audit/**\` (ảnh, manifest, review, log và index.html). Không có file source ngoài phạm vi. Output build/gate sinh tự động nằm trong thư mục ignored của công cụ hiện có.

Lead **không cần nối gì vào index.ts**; dùng QA hook có sẵn. Chạy lại trên thư mục bằng chứng mới/rỗng vì capture dùng flag wx để không ghi đè ảnh cũ:

\`\`\`powershell
node tools/serve-out/index.mjs out --port 4203
node tools/review/hr-audit.mjs --capture
node tools/review/hr-audit.mjs --supplement
node tools/review/hr-audit.mjs --horizon-match
\`\`\`

Giới hạn: ảnh tĩnh không chứng minh lỗi chuyển động/flicker, clipping giữa mọi frame hay độ mượt tương tác; quần áo/sóng/lá/chim/cá chuyển động nên ảnh không khóa cùng phase. Source nghi vấn cần ticket sửa riêng. Không có ảnh chụp thật đối chiếu được tải về trong audit; nhận xét photoreal là đánh giá trực tiếp đặc điểm nhìn thấy, không phải blind test phân biệt ảnh thật.
`;
await writeFile(path.join(root, "tests/review/HR-AUDIT.md"), report);
const cards = shots.map(s => `<article id="${s.id}" data-search="${esc(`${s.id} ${s.zone} ${s.subject} ${notes[s.id].join(" ")}`)}" data-quality="${s.quality}"><h2>${esc(s.id)} · ${esc(s.subject)}</h2><a href="${s.file}"><img loading="lazy" src="${s.file}" width="1600" height="900" alt="${esc(s.subject)}"></a><p>${s.quality.toUpperCase()} · ${s.renderedFps.toFixed(1)} FPS render / ${s.fps.toFixed(1)} rAF · p95 ${s.p95Ms.toFixed(1)} ms</p><p>${esc(notes[s.id].join(" · "))}</p><details><summary>Camera / số đo</summary><pre>${esc(JSON.stringify(s, null, 2))}</pre></details></article>`).join("\n");
await writeFile(path.join(dest, "index.html"), `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HR-AUDIT · ${shots.length} ảnh đã review</title><style>body{background:#17201c;color:#eee;font:16px system-ui;margin:24px}header{position:sticky;top:0;background:#17201cf2;padding:10px;z-index:1}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:20px}img{width:100%;height:auto}article{background:#24342b;padding:16px;scroll-margin-top:150px}a{color:#bdebd4}pre{white-space:pre-wrap;overflow-wrap:anywhere}input,select{font:inherit;padding:8px;max-width:100%}[hidden]{display:none}</style><header><h1>HR-AUDIT · ${shots.length} ảnh đã mở xem · ${findings.length} nhóm phát hiện</h1><p>main ${main.head} · Edge RTX 3060 · 1600×900 · <a href="../../tests/review/HR-AUDIT.md">Báo cáo</a> · <a href="review.json">Review JSON</a> · <a href="lead-comparison-horizon.webp">Ảnh Lead cũ (riêng)</a></p><label>Lọc khu/vật/ID <input id="search" type="search"></label> <label>Quality <select id="quality"><option value="">Tất cả</option><option>high</option><option>low</option></select></label> <output id="count"></output></header><main>${cards}</main><script>const search=document.querySelector('#search'),quality=document.querySelector('#quality'),cards=[...document.querySelectorAll('article')];function filter(){let n=0;for(const c of cards){c.hidden=!(c.dataset.search.toLowerCase().includes(search.value.toLowerCase())&&(!quality.value||c.dataset.quality===quality.value));if(!c.hidden)n++}document.querySelector('#count').value=n+' ảnh'}search.addEventListener('input',filter);quality.addEventListener('change',filter);filter();</script></html>`);
console.log(`HR-AUDIT reviewed: ${shots.length} originals (${high.length} High + 1 Low), ${findings.length} findings; image sizes and source/evidence links verified.`);
