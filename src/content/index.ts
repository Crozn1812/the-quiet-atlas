import evidence from "./evidence.json";
import { validateContent } from "./schema";
import { locales } from "@/i18n/locales";
// Public project copy. Every sentence traces to Duy's answers (DUY_QUEUE, 2026-11-04), a public README or his CV.
// Unknown stays "TBD". Never name internal SharePoint sites/lists, departments, area codes, IDs, hosts or IPs (CLAUDE.md §6).
type Copy={
  title: string;
  summary: string;
  context: string;
  problem: string;
  constraints: string;
  myRole: string;
  contributions: string;
  teamContext: string;
  architecture: string;
  decisions: string;
  alternatives: string;
  implementation: string;
  validation: string;
  results: string;
  lessons: string;
};
type Locale=(typeof locales)[number];
const slugs=[
  "cms-devops-platform-aws-eks","partner-data-gateway-azure","insighthub-rag","aws-sales-data-pipeline"
];
const copy: Record<string, Record<Locale, Copy>>={
  "cms-devops-platform-aws-eks": {
    en: {
      title: "CMS DevOps Platform AWS EKS",
      summary: "A platform that builds and automates delivery of a content management system (CMS) on Amazon EKS, combining Terraform infrastructure as code, Jenkins CI, Argo CD GitOps and monitoring. Evidence level is low: design slides only.",
      context: "Graduation project of the VTI DevOps course, done by Duy alone. After submission VTI removed the whole AWS environment, so no running demo exists and there is no public repository; the only remaining material is the presentation slides.",
      problem: "Manual deployment made the CMS hard to stabilise and trace: inconsistent environments, many error-prone steps, hard-to-trace versions and uncontrolled rollback.",
      constraints: "The environment ran on AWS only until the course removed it; budget and timeframe: TBD.",
      myRole: "Sole author of the graduation project (platform design and delivery pipeline).",
      contributions: "Designed the whole chain described under architecture alone, from infrastructure as code to monitoring (per the slides). Which parts were provided by the course: TBD.",
      teamContext: "Individual project; no team.",
      architecture: "Only the load balancer is public (HTTPS entry); workloads and the data tier sit in private subnets across two Availability Zones with 2 worker nodes. Request path: client, HTTPS, load balancer, frontend/backend; only the backend touches data, Redis reduces repeated PostgreSQL queries, and health probes gate traffic. Data: Redis (ElastiCache) cache plus a private Multi-AZ RDS PostgreSQL. Delivery: Jenkins CI, Amazon ECR (immutable images), Argo CD GitOps, EKS. Observability: CloudWatch plus Prometheus and Grafana.",
      decisions: "One tool per responsibility (Terraform, Jenkins, ECR, Argo CD, EKS, RDS plus Redis, SonarQube plus Trivy, CloudWatch plus Grafana). Jenkins owns CI and Argo CD owns CD and reconciliation; image tags use the build number or commit SHA; rollback preferably by Git revert. Terraform state is stored centrally in an encrypted, versioned S3 backend, never in Git, and plan precedes apply. Containers run non-root with no secrets baked in. Rolling updates use a PodDisruptionBudget with startup, readiness and liveness probes. Security in depth: least-privilege IAM, public/private network split, security groups plus NetworkPolicy, secrets management. Dev, Staging, manual approval, Production, with the same image and different configuration.",
      alternatives: "The slides compare against a basic model: hand-made infrastructure, CI and CD in one script, the latest image tag, public workloads and databases, manual rollback and errors found by users. Whether these were actually tried before: TBD.",
      implementation: "Kubernetes objects: Deployment, Service, ConfigMap, ServiceAccount, Ingress, NetworkPolicy and HPA in a dedicated namespace. Quality and security gates with SonarQube and Trivy stop the pipeline on failure. Code and pipeline definitions are not published: TBD.",
      validation: "The slides plan a five-minute live demo: a code change, git push, Jenkins, a new image, Argo CD, an EKS rollout and HTTP 200 on the health endpoint. Whether it was recorded: TBD. The environment no longer exists, so nothing can be re-run.",
      results: "Self-reported on the slides: Terraform/VPC/EKS with 2 worker nodes; private Multi-AZ RDS plus Redis; Jenkins, ECR and Argo CD GitOps; private by default with a Pod security baseline; rolling update, probes and rollback; CloudWatch, Prometheus and Grafana. Independent evidence (screenshots, logs, repository): none yet. Metrics: not measured.",
      lessons: "Incidents turned into operating rules: confirm the AWS identity and region before acting; add only the IAM permissions needed; after an interrupted terraform apply inspect the state and re-plan instead of deleting resources by hand; separate resource problems from access-entry problems on EKS. Personal reflection: TBD."
    },
    vi: {
      title: "CMS DevOps Platform AWS EKS",
      summary: "Nền tảng xây dựng và tự động hóa triển khai hệ thống quản trị nội dung (CMS) trên Amazon EKS, kết hợp Terraform (IaC), Jenkins CI, Argo CD GitOps và giám sát. Mức bằng chứng thấp: chỉ có slide thiết kế.",
      context: "Bài tốt nghiệp khóa VTI DevOps, một mình Duy thực hiện. Sau khi nộp, VTI đã gỡ toàn bộ môi trường AWS nên không còn demo chạy và không có repo công khai; tài liệu còn lại là bộ slide trình bày.",
      problem: "Triển khai thủ công khiến CMS khó ổn định và khó truy vết: môi trường không đồng nhất, nhiều bước dễ sai, khó truy vết phiên bản, rollback thiếu kiểm soát.",
      constraints: "Môi trường chỉ chạy trên AWS cho tới khi khóa học gỡ bỏ; ngân sách và thời gian thực hiện: TBD.",
      myRole: "Một mình thực hiện bài tốt nghiệp (thiết kế nền tảng và quy trình phát hành).",
      contributions: "Một mình thiết kế toàn bộ chuỗi mô tả ở mục kiến trúc, từ hạ tầng dưới dạng mã đến giám sát (theo slide). Phần nào do khóa học cung cấp: TBD.",
      teamContext: "Dự án cá nhân, không có nhóm.",
      architecture: "Chỉ load balancer là điểm public (nhận HTTPS); workload và tầng dữ liệu nằm trong private subnet trên hai Availability Zone, có 2 worker node. Luồng request: client, HTTPS, load balancer, frontend/backend; chỉ backend truy cập dữ liệu, Redis giảm truy vấn lặp tới PostgreSQL, health probe quyết định traffic. Dữ liệu: cache Redis (ElastiCache) và RDS PostgreSQL private, Multi-AZ. Phát hành: Jenkins CI, Amazon ECR (image bất biến), Argo CD GitOps, EKS. Quan sát: CloudWatch cùng Prometheus và Grafana.",
      decisions: "Mỗi công cụ một trách nhiệm (Terraform, Jenkins, ECR, Argo CD, EKS, RDS cùng Redis, SonarQube cùng Trivy, CloudWatch cùng Grafana). Jenkins lo CI, Argo CD lo CD và reconciliation; tag image theo build number hoặc commit SHA; rollback ưu tiên bằng Git revert. State Terraform lưu tập trung ở backend S3 có mã hóa và versioning, không đưa vào Git, và plan trước apply. Container chạy non-root, không chứa secret. Rolling update kèm PodDisruptionBudget và probe startup, readiness, liveness. Bảo mật nhiều lớp: IAM tối thiểu, tách mạng public/private, Security Group cùng NetworkPolicy, quản lý secret. Dev, Staging, duyệt thủ công, Production, cùng một image và khác cấu hình.",
      alternatives: "Slide so sánh với mô hình cơ bản: hạ tầng tạo thủ công, CI và CD chung một script, tag latest, workload và database public, rollback thủ công, lỗi do người dùng phát hiện. Các phương án này có thực sự được thử trước không: TBD.",
      implementation: "Đối tượng Kubernetes: Deployment, Service, ConfigMap, ServiceAccount, Ingress, NetworkPolicy và HPA trong namespace riêng. Cổng chất lượng và bảo mật SonarQube, Trivy làm pipeline dừng khi lỗi. Mã nguồn và định nghĩa pipeline chưa công bố: TBD.",
      validation: "Slide có kế hoạch demo trực tiếp 5 phút: sửa code, git push, Jenkins, image mới, Argo CD, EKS rollout và HTTP 200 ở health endpoint. Có ghi hình hay không: TBD. Môi trường không còn nên không thể chạy lại.",
      results: "Tự báo cáo trên slide: Terraform/VPC/EKS 2 worker node; RDS private Multi-AZ cùng Redis; Jenkins, ECR và Argo CD GitOps; private-by-default với baseline bảo mật Pod; rolling update, probe và rollback; CloudWatch, Prometheus và Grafana. Bằng chứng độc lập (ảnh, log, repo): chưa có. Số liệu: chưa đo.",
      lessons: "Sự cố thành quy tắc vận hành: xác nhận danh tính và region AWS trước khi thao tác; chỉ bổ sung đúng quyền IAM cần; sau khi terraform apply bị gián đoạn thì kiểm tra state và chạy lại plan, không xóa resource thủ công; tách lỗi tài nguyên với lỗi phân quyền truy cập EKS. Bài học cá nhân: TBD."
    }
  },
  "partner-data-gateway-azure": {
    en: {
      title: "Secure Partner Data Sharing Portal",
      summary: "A secure way to share approved internal data with external partners through Azure API Management instead of granting direct SharePoint access: each partner has its own subscription key, and an Azure Function returns only the records and fields that partner may see. Built at HPT in two phases; both are complete.",
      context: "Partners and internal staff need to look up approved data. The data sits in an internal SharePoint Online list and other internal systems, and sharing it by granting direct SharePoint access was judged risky. Work done during Duy's internship at HPT, from July 2026. Duy approves what is published.",
      problem: "Handling each request by hand is slow and error-prone, with no record of who received what data, when or how often. Direct SharePoint access can expose internal URLs, site structure and out-of-scope data. Four risks: a partner seeing another partner's data, exposure of internal sources, difficulty revoking access when a partnership ends, and no visibility into who calls what.",
      constraints: "Phase 1 scope: one SharePoint Online list as the source, a REST API returning JSON, APIM subscription-key authentication and an Azure Function backend on .NET 8 (isolated). Phase 2: the API Management tier has no Developer Portal or Groups, and the on-premises server is small and shared with existing services, so the new stack must not disturb the existing API and gateway.",
      myRole: "Cloud & DevOps intern at HPT; presenter of the phase 1 proof of concept. Exact split of work inside the implementation team: TBD.",
      contributions: "Created an individual APIM subscription and key per partner; developed an Azure Function that reads SharePoint data and filters it by partner ID; implemented rate limiting, correlation IDs, key rotation and subscription revocation; tested authentication, error handling and isolation between partners (per Duy's CV). Phase 2, with a Kong gateway and an on-premises data service, was completed as well.",
      teamContext: "An implementation team existed; number of people and roles: TBD.",
      architecture: "Phase 1: partner, Azure API Management, Azure Function, Microsoft Graph, SharePoint Online list. Filtered JSON returns through APIM; the partner never sees SharePoint URLs, site or list identifiers, or internal tokens. Three zones: outside (the partner holds only the APIM URL and a subscription key), Azure (APIM checks the key and identifies the partner; the Function filters and normalises data) and Microsoft 365 (Graph reads SharePoint with least privilege). An invalid key stops at APIM with 401; records not belonging to the partner are dropped in the Function. Phase 2: partner, APIM, Azure Function, Kong gateway on-premises, a data API reading sample Parquet files. Partner identity travels in a JWT (partner ID plus the APIM subscription ID) checked against the real subscription; permission profiles shared per APIM Product define datasets and allowed fields; separate internal keys protect each hop.",
      decisions: "Every partner request goes through APIM, with no exception; APIM never reads SharePoint, the Function does. One independent subscription per partner so revoking one does not affect the others. Seven security layers: gateway key, subscription-to-partner mapping, APIM policy (overwrite internal headers, correlation ID, rate limit), partner check and mandatory filtering in the Function, field-allowlisted responses, least-privilege Graph permission, and operations (monitoring, alerting, periodic rotate/revoke). Phase 2 groups partners by identical permission sets (Product plus shared profile) instead of one Product per partner, and the field list is an explicit allowlist, never a wildcard.",
      alternatives: "Rejected: granting partners direct SharePoint access, and manual per-request sharing. OAuth/Entra tokens for partners were left to a later stage; phase 2 chose a self-issued JWT instead of an Entra app registration. Further trade-offs: TBD.",
      implementation: "Twelve steps: identify the SharePoint source, create the Entra ID app identity, grant Graph permissions, create, deploy and test the Function App, create APIM and integrate the Function, then Product, Subscription and acceptance testing. Partner key lifecycle: create, distribute, rotate, revoke. Phase 2 added the gateway and data service on-premises beside the existing API without changing it.",
      validation: "Acceptance list: a valid key returns 200; a missing or wrong key returns 401; Partner A cannot see Partner B's data (achieved, per Duy); Graph errors do not leak tokens or internal errors; no SharePoint URL or identifier is exposed; JSON format is consistent; a suspended subscription is rejected; an unknown request returns 404; going over the limit returns 429. Key rotation and revocation are done. Raw test logs and screenshots are not published: TBD.",
      results: "Phase 1 worked end to end: the endpoint returned 200 and the test partner received exactly the 2 records assigned to it. Phase 2 (Kong, on-premises) is complete according to Duy. Latency, volume, cost and adoption were not measured. The public repository is a demo with mock data, not the company system.",
      lessons: "Being allowed to read a column does not mean two partners may read each other's rows; the source schema and the publishing permission are separate steps. Personal reflection: TBD."
    },
    vi: {
      title: "Secure Partner Data Sharing Portal",
      summary: "Cách chia sẻ an toàn dữ liệu nội bộ đã duyệt cho đối tác qua Azure API Management thay vì cấp quyền SharePoint trực tiếp: mỗi đối tác có subscription key riêng, Azure Function chỉ trả về bản ghi và trường dữ liệu đối tác đó được phép xem. Thực hiện tại HPT theo hai giai đoạn; cả hai đã hoàn thành.",
      context: "Đối tác và nhân viên nội bộ cần tra cứu dữ liệu đã duyệt. Dữ liệu nằm trong một danh sách SharePoint Online nội bộ và các hệ thống nội bộ khác; cách chia sẻ bằng cấp quyền SharePoint trực tiếp được đánh giá là rủi ro. Thực hiện trong thời gian Duy thực tập tại HPT, từ 07/2026. Duy là người duyệt nội dung công bố.",
      problem: "Xử lý thủ công từng yêu cầu tốn công, dễ sai, không theo dõi được ai nhận dữ liệu gì, khi nào, bao nhiêu lần. Cấp quyền SharePoint trực tiếp có thể lộ URL nội bộ, cấu trúc site và dữ liệu ngoài phạm vi. Bốn rủi ro: đối tác thấy dữ liệu của đối tác khác, lộ nguồn nội bộ, khó thu hồi quyền khi ngừng hợp tác, không biết ai gọi lúc nào.",
      constraints: "Phạm vi giai đoạn 1: nguồn là một danh sách SharePoint Online, REST API trả JSON, xác thực bằng APIM subscription key, backend Azure Function .NET 8 (isolated). Giai đoạn 2: tier API Management không có Developer Portal và Groups, máy chủ on-prem nhỏ và dùng chung với dịch vụ cũ nên bộ mới không được ảnh hưởng API và gateway hiện có.",
      myRole: "Thực tập sinh Cloud & DevOps tại HPT; người trình bày PoC giai đoạn 1. Phân chia việc cụ thể trong nhóm thực hiện: TBD.",
      contributions: "Tạo subscription và key APIM riêng cho từng đối tác; viết Azure Function đọc dữ liệu SharePoint và lọc theo Partner ID; triển khai rate limit, correlation ID, xoay key và thu hồi subscription; kiểm thử xác thực, xử lý lỗi và cô lập dữ liệu giữa các đối tác (theo CV của Duy). Giai đoạn 2, với gateway Kong và dịch vụ dữ liệu on-prem, cũng đã hoàn thành.",
      teamContext: "Có nhóm thực hiện; số người và vai trò: TBD.",
      architecture: "Giai đoạn 1: đối tác, Azure API Management, Azure Function, Microsoft Graph, danh sách SharePoint Online. JSON đã lọc trả về qua APIM; đối tác không thấy URL SharePoint, mã site hay list, hay token nội bộ. Ba vùng: bên ngoài (đối tác chỉ có URL APIM và subscription key), Azure (APIM kiểm tra key và xác định đối tác; Function lọc và chuẩn hóa dữ liệu), Microsoft 365 (Graph đọc SharePoint theo quyền tối thiểu). Key sai dừng ở APIM với 401; bản ghi không thuộc đối tác bị loại ở Function. Giai đoạn 2: đối tác, APIM, Azure Function, gateway Kong on-prem, data API đọc các file Parquet mẫu. Danh tính đối tác mang trong JWT (Partner ID và Subscription ID của APIM) được đối chiếu với subscription thật; profile quyền dùng chung theo Product quy định dataset và trường được đọc; key nội bộ tách riêng cho từng chặng.",
      decisions: "Mọi yêu cầu của đối tác đều đi qua APIM, không ngoại lệ; APIM không đọc SharePoint mà để Function làm. Mỗi đối tác một subscription độc lập để thu hồi không ảnh hưởng đối tác khác. Bảy lớp bảo mật: key cổng API, ánh xạ subscription sang đối tác, policy APIM (ghi đè header nội bộ, correlation ID, rate limit), Function kiểm tra đối tác và bắt buộc lọc, phản hồi chỉ gồm trường đã duyệt, quyền Graph tối thiểu, vận hành (giám sát, cảnh báo, rotate/revoke định kỳ). Giai đoạn 2 gom đối tác theo tập quyền giống nhau (Product cùng profile dùng chung) thay vì mỗi đối tác một Product, và danh sách trường là allowlist rõ ràng, không dùng ký tự đại diện.",
      alternatives: "Đã loại: cấp quyền SharePoint trực tiếp cho đối tác và chia sẻ thủ công từng yêu cầu. OAuth/Entra token cho đối tác để giai đoạn sau; giai đoạn 2 chọn JWT tự cấp thay vì Entra app registration. Các đánh đổi chi tiết hơn: TBD.",
      implementation: "Mười hai bước: xác định nguồn SharePoint, tạo danh tính ứng dụng Entra ID, cấp quyền Graph, tạo, deploy và test Function App, tạo APIM và tích hợp Function, rồi Product, Subscription và kiểm thử nghiệm thu. Vòng đời key đối tác: tạo, phân phối, xoay, thu hồi. Giai đoạn 2 thêm gateway và dịch vụ dữ liệu on-prem bên cạnh API hiện có mà không thay đổi nó.",
      validation: "Danh sách nghiệm thu: key đúng trả 200; thiếu hoặc sai key trả 401; Partner A không xem được dữ liệu Partner B (đã đạt, theo Duy); lỗi Graph không lộ token hay lỗi nội bộ; không lộ URL hay mã SharePoint; JSON thống nhất; subscription bị suspend thì bị từ chối; yêu cầu không tồn tại trả 404; vượt giới hạn trả 429. Xoay key và thu hồi đã xong. Log và ảnh kiểm thử gốc chưa công bố: TBD.",
      results: "Giai đoạn 1 chạy end-to-end: endpoint trả 200 và đối tác thử nghiệm nhận đúng 2 bản ghi đã gán. Giai đoạn 2 (Kong, on-prem) đã hoàn thành theo Duy. Độ trễ, khối lượng, chi phí và mức sử dụng chưa đo. Repo công khai là bản demo dùng dữ liệu giả, không phải hệ thống của công ty.",
      lessons: "Cùng được đọc một cột không có nghĩa hai đối tác đọc được bản ghi của nhau; schema nguồn và quyền công bố là hai bước riêng. Bài học cá nhân: TBD."
    }
  },
  "insighthub-rag": {
    en: {
      title: "InsightHub RAG",
      summary: "InsightHub is a local RAG notebook: upload .txt, .md or .pdf files, ingest them asynchronously, ask questions and review citations. Duy wrote the whole implementation, including the DevOps, security, observability and cost-tracking layers, on a repository supplied by the instructor.",
      context: "An implementation built from the instructor's repository: the instructor supplied the starting repository and Duy wrote the implementation. Language models answer better about new documents when relevant passages are retrieved and supplied as context, and RAG also allows citing sources.",
      problem: "Turn raw files into structured, traceable knowledge: each answer must trace back to a chunk and its source document, and the database must prevent invalid states, for example a document marked ready without stored vectors.",
      constraints: "Everything runs locally (Docker Desktop Kubernetes, Ollama on the host); no AWS runtime was executed and nothing was applied to a cloud. The embedding model's 512-token context limited chunk size. The project was a seven-day piece of work.",
      myRole: "Wrote the whole implementation on the instructor's repository.",
      contributions: "The web, API and ingestion worker; the PostgreSQL plus pgvector data model; Terraform and Helm, GitHub Actions and Checkov for the local path; guardrails on input, context and output; Prometheus and Grafana monitoring; a chat-ops bot; per-workflow budget keys. Exact file-level split against the instructor's starter: TBD.",
      teamContext: "Duy wrote the implementation; the original repository was provided by the instructor.",
      architecture: "Next.js web, FastAPI, a Redis/ARQ queue, a separate ingestion worker and PostgreSQL 16 with pgvector. Upload returns HTTP 202 after enqueueing; the worker chunks, embeds and stores with bounded retry and idempotent replay. Chat retrieves context, goes through LiteLLM to a local Ollama model, and validates structured output and citations; guardrails on input, context and output fail closed. Data model: documents, chunks (text plus a 1024-dimension vector) and an embedding identity table; a B-tree index on status and an HNSW index on vectors; cosine-distance search. Monitoring with Prometheus and Grafana.",
      decisions: "Integrity rules live in the schema, not only in the application: keys, a CHECK that a ready document has chunks, unique chunk order, cascading deletes and a fixed vector size. Ingestion is one transaction with row locking; an embedding failure rolls back to failed instead of a fake ready. Vectors from different models are never mixed, guarded by the embedding identity table. Citations derive from retrieval results rather than a separate table. Three LiteLLM virtual keys with a maximum budget attribute spend per workflow.",
      alternatives: "LLM-only answering versus RAG, where retrieval supplies context and citations. Other alternatives weighed: TBD.",
      implementation: "Terraform and Helm with pinned versions, policies, Checkov and GitHub Actions for the local and static path, plus opt-in protected OIDC AWS jobs that were never applied. MCP with four pinned backends and read-only access. Security work: input, context and output guards, prompt-leak and poisoning handling, Promptfoo. Layout: web, api, ingestion-worker, chatops-bot, infra, observability, security, finops, tests.",
      validation: "Upstream compliance scan of 70 cases: 69 pass, 1 fail, 0 error, 0 high, 0 critical; the official day-6 acceptance is not met. The latest guardrail probe: 4 pass, 1 fail (an output behaviour-override sentence was allowed). End-to-end local check: upload HTTP 202, ingestion ready, embedding HTTP 200 (1024 dimensions), RAG HTTP 200, citations verified; this is not a general accuracy benchmark.",
      results: "A real incident was fixed: embedding requests failed with HTTP 400 because chunks exceeded the model's 512-token context. Reducing the conservative chunk budget from 800 to 400 let three failed documents be reprocessed to ready (124 chunks each) without losing IDs or payload, with the same model and data. The local runtime works; the AWS runtime was not executed. Answer quality: not measured. Local model cost is zero.",
      lessons: "A useful RAG starts with organised, traceable data: structure (keys and identities), discipline (states, transactions, constraints) and verifiability (retrieve and cite). Do not replace database volumes or the embedding identity on restart. Historical failures are kept visible rather than hidden, and the repository makes no claim of passing every security test, AWS deployment or production readiness. Personal reflection: TBD."
    },
    vi: {
      title: "InsightHub RAG",
      summary: "InsightHub là sổ tay hỏi đáp RAG chạy local: tải file .txt, .md hoặc .pdf, nạp bất đồng bộ, đặt câu hỏi và xem trích dẫn nguồn. Duy viết toàn bộ phần triển khai, gồm các lớp DevOps, bảo mật, quan sát và theo dõi chi phí, trên repo do giảng viên cung cấp.",
      context: "Bản triển khai từ repo của giảng viên: giảng viên cung cấp repo xuất phát và Duy viết phần triển khai. Mô hình ngôn ngữ trả lời tốt hơn về tài liệu mới khi được cung cấp đúng đoạn liên quan làm ngữ cảnh; RAG còn cho phép dẫn nguồn.",
      problem: "Biến file thô thành kho tri thức có cấu trúc và truy vết được: mỗi câu trả lời phải lần ngược được tới đoạn trích và tài liệu gốc, và CSDL phải chặn trạng thái sai, ví dụ tài liệu ready khi chưa ghi vector.",
      constraints: "Mọi thứ chạy local (Kubernetes của Docker Desktop, Ollama trên máy host); không chạy runtime AWS và không apply lên cloud. Giới hạn context 512 token của mô hình embedding ràng buộc kích thước chunk. Đây là công việc trong khung bảy ngày.",
      myRole: "Viết toàn bộ phần triển khai trên repo của giảng viên.",
      contributions: "Web, API và worker nạp dữ liệu; mô hình dữ liệu PostgreSQL cùng pgvector; Terraform và Helm, GitHub Actions và Checkov cho đường local; guardrail cho input, ngữ cảnh và output; giám sát Prometheus và Grafana; chat-ops bot; key ngân sách theo từng luồng công việc. Phân chia chi tiết theo file so với bản xuất phát của giảng viên: TBD.",
      teamContext: "Duy viết phần triển khai; repo gốc do giảng viên cung cấp.",
      architecture: "Next.js web, FastAPI, hàng đợi Redis/ARQ, worker nạp dữ liệu riêng và PostgreSQL 16 với pgvector. Upload trả HTTP 202 sau khi xếp hàng; worker chia đoạn, tạo embedding, lưu, có retry giới hạn và replay idempotent. Chat truy xuất ngữ cảnh, đi qua LiteLLM tới mô hình Ollama local, kiểm tra output có cấu trúc và trích dẫn; guardrail cho input, ngữ cảnh, output lỗi thì đóng (fail closed). Mô hình dữ liệu: documents, chunks (văn bản cùng vector 1024 chiều) và bảng định danh embedding; index B-tree cho trạng thái, HNSW cho vector; tìm theo cosine distance. Giám sát bằng Prometheus và Grafana.",
      decisions: "Luật toàn vẹn nằm ngay trong schema, không chỉ trong ứng dụng: khóa, CHECK tài liệu ready phải có chunks, UNIQUE thứ tự chunk, xóa theo tầng và kích thước vector cố định. Nạp dữ liệu trong một transaction có khóa bản ghi; lỗi embedding thì rollback về failed, không để ready giả. Không trộn vector của các mô hình khác nhau, được bảo đảm bởi bảng định danh embedding. Trích dẫn sinh từ kết quả truy xuất, không có bảng riêng. Ba virtual key LiteLLM có ngân sách tối đa để quy chi phí theo luồng công việc.",
      alternatives: "Chỉ dùng LLM so với RAG, nơi truy xuất cung cấp ngữ cảnh và nguồn. Phương án khác đã cân nhắc: TBD.",
      implementation: "Terraform và Helm ghim phiên bản, policy, Checkov và GitHub Actions cho đường local và static, kèm job AWS qua OIDC được bảo vệ, chỉ chạy khi bật và chưa từng apply. MCP với bốn backend ghim phiên bản, chỉ đọc. Bảo mật: guard cho input, ngữ cảnh và output, xử lý prompt-leak và poisoning, Promptfoo. Cấu trúc: web, api, ingestion-worker, chatops-bot, infra, observability, security, finops, tests.",
      validation: "Quét tuân thủ upstream 70 mục: 69 pass, 1 fail, 0 error, 0 high, 0 critical; nghiệm thu chính thức ngày 6 chưa đạt. Lần probe guardrail gần nhất: 4 pass, 1 fail (một câu ghi đè hành vi ở output lọt qua). Kiểm thử đầu-cuối local: upload HTTP 202, nạp ready, embedding HTTP 200 (1024 chiều), RAG HTTP 200, trích dẫn đã kiểm; đây không phải benchmark độ chính xác tổng quát.",
      results: "Đã khắc phục sự cố thật: request embedding lỗi HTTP 400 vì chunk vượt context 512 token của mô hình. Giảm ngân sách chunk ước lượng từ 800 xuống 400 giúp xử lý lại ba tài liệu từ failed sang ready (mỗi tài liệu 124 chunks) mà không mất ID hay payload, giữ nguyên mô hình và dữ liệu. Runtime local dùng được; runtime AWS chưa chạy. Chất lượng câu trả lời: chưa đo. Chi phí mô hình local bằng không.",
      lessons: "RAG hữu ích bắt đầu từ dữ liệu có tổ chức, truy nguồn được: có cấu trúc (khóa, định danh), có kỷ luật (trạng thái, transaction, ràng buộc), kiểm chứng được (truy xuất và dẫn nguồn). Không thay volume DB hay embedding identity khi khởi động lại. Thất bại cũ được giữ lại thay vì che, và repo không tuyên bố mọi test bảo mật pass, đã deploy AWS hay production-ready. Bài học cá nhân: TBD."
    }
  },
  "aws-sales-data-pipeline": {
    en: {
      title: "AWS Sales Data Pipeline",
      summary: "An event-driven AWS pipeline that validates, cleans and transforms retail sales CSV files uploaded to S3, separates bad records, and tracks file metadata in DynamoDB; infrastructure is defined with AWS CDK.",
      context: "Retail sales data arrives as CSV files; the project automates processing from upload to analytics-ready output. A personal project listed in Duy's CV.",
      problem: "Raw CSV files need schema validation, cleaning and splitting of valid and invalid records before they can feed metrics such as daily revenue, top products, payment success rate and orders per customer.",
      constraints: "Time constraints left alerting, retries, idempotency and BI integration unimplemented. Budget and data volume: TBD.",
      myRole: "Author of a personal project.",
      contributions: "Used AWS CDK to deploy S3, Lambda and DynamoDB; wrote Python and Pandas scripts to clean, transform and partition CSV data; wrote Pytest tests for the data logic (per Duy's CV and the README).",
      teamContext: "Personal project; no team.",
      architecture: "CSV upload to an S3 raw bucket, an S3 event triggers a Lambda function, and Lambda validates the schema, cleans data and splits valid from invalid records. Clean data goes to a processed bucket, invalid data to an error bucket and metadata to DynamoDB; logs go to CloudWatch; infrastructure is in AWS CDK. Output storage is partitioned.",
      decisions: "Lambda for simple, scalable processing; S3 for storage and as the event trigger; DynamoDB for fast metadata tracking. Least-privilege IAM scoped to the required resources and blocked public access on S3.",
      alternatives: "TBD.",
      implementation: "Repository layout: infrastructure, src, tests, evidence and docs, with an app entry point and a local runner. Deployed with cdk bootstrap and cdk deploy; torn down with cdk destroy.",
      validation: "Five Pytest cases: happy path, missing data, duplicate records, invalid values and error handling. The repository holds execution screenshots for pytest, deploy, processed data, error handling, DynamoDB metadata, business metrics and CloudWatch logs.",
      results: "An example run on the sample file produced 99 clean records and 4 error records with status COMPLETED (sample data, not a performance metric). Bad records are separated into the error bucket and logs are available in CloudWatch. Throughput, latency and cost were not measured.",
      lessons: "Known gaps to address next: CloudWatch alarm and SNS alerting, a retry mechanism, idempotency for duplicate processing, and Athena or QuickSight integration. Personal reflection: TBD."
    },
    vi: {
      title: "AWS Sales Data Pipeline",
      summary: "Pipeline hướng sự kiện trên AWS: khi file CSV bán hàng được tải lên S3, hệ thống kiểm tra, làm sạch, biến đổi dữ liệu, tách bản ghi lỗi và lưu metadata vào DynamoDB; hạ tầng khai báo bằng AWS CDK.",
      context: "Dữ liệu bán lẻ đến dưới dạng file CSV; dự án tự động hóa xử lý từ lúc tải lên đến dữ liệu sẵn sàng cho phân tích. Dự án cá nhân có trong CV của Duy.",
      problem: "File CSV thô cần được kiểm tra schema, làm sạch và tách bản ghi hợp lệ, không hợp lệ trước khi dùng cho các chỉ số như doanh thu theo ngày, sản phẩm bán chạy, tỉ lệ thanh toán thành công và số đơn mỗi khách.",
      constraints: "Do giới hạn thời gian, chưa làm cảnh báo, retry, idempotency và tích hợp BI. Ngân sách và khối lượng dữ liệu: TBD.",
      myRole: "Tác giả của một dự án cá nhân.",
      contributions: "Dùng AWS CDK triển khai S3, Lambda và DynamoDB; viết script Python và Pandas làm sạch, biến đổi và phân vùng dữ liệu CSV; viết test Pytest cho logic dữ liệu (theo CV của Duy và README).",
      teamContext: "Dự án cá nhân, không có nhóm.",
      architecture: "Tải CSV vào bucket S3 raw, sự kiện S3 kích hoạt Lambda, Lambda kiểm tra schema, làm sạch và tách bản ghi hợp lệ, lỗi. Dữ liệu sạch vào bucket processed, dữ liệu lỗi vào bucket error, metadata vào DynamoDB; log ở CloudWatch; hạ tầng bằng AWS CDK. Dữ liệu đầu ra được phân vùng.",
      decisions: "Lambda cho xử lý đơn giản, mở rộng được; S3 vừa lưu trữ vừa làm nguồn sự kiện; DynamoDB để theo dõi metadata nhanh. IAM tối thiểu theo tài nguyên cần và chặn public access trên S3.",
      alternatives: "TBD.",
      implementation: "Cấu trúc repo: infrastructure, src, tests, evidence và docs, cùng file khởi chạy và trình chạy local. Triển khai bằng cdk bootstrap và cdk deploy; dọn bằng cdk destroy.",
      validation: "Năm test Pytest: happy path, thiếu dữ liệu, bản ghi trùng, giá trị không hợp lệ và xử lý lỗi. Repo có ảnh minh chứng chạy pytest, deploy, dữ liệu đã xử lý, xử lý lỗi, metadata DynamoDB, chỉ số kinh doanh và log CloudWatch.",
      results: "Ví dụ chạy với file mẫu cho 99 bản ghi sạch và 4 bản ghi lỗi, trạng thái COMPLETED (dữ liệu mẫu, không phải chỉ số hiệu năng). Bản ghi lỗi được tách sang bucket error và log có ở CloudWatch. Thông lượng, độ trễ và chi phí chưa đo.",
      lessons: "Việc cần làm tiếp: cảnh báo CloudWatch Alarm và SNS, cơ chế retry, idempotency khi xử lý trùng, và tích hợp Athena hoặc QuickSight. Bài học cá nhân: TBD."
    }
  }
};
// Repo công khai Duy cung cấp ngày 2026-11-04.
const repos: Record<string, { repoUrl: string; evidence: string[] }>={
  "cms-devops-platform-aws-eks": {
    repoUrl: "TBD",
    evidence: ["ev-cms-devops-platform-slides"]
  },
  "aws-sales-data-pipeline": {
    repoUrl: "https://github.com/Crozn1812/AWS-Sales-Data-Pipeline",
    evidence: ["ev-repo-aws-sales-data-pipeline"]
  },
  "insighthub-rag": {
    repoUrl: "https://github.com/Crozn1812/insighthub_devops",
    evidence: ["ev-repo-insighthub-rag"]
  },
  "partner-data-gateway-azure": {
    repoUrl: "https://github.com/Crozn1812/azure-api-gateway-dsr-ai",
    evidence: ["ev-repo-partner-data-gateway-demo"]
  }
};
// Duy duyệt từng trang (Q-04) trước khi gỡ nhãn Draft.
const review={
  reviewStatus: "draft",
  publicApproval: "TBD",
  lastReviewedAt: "TBD"
};
const introduction: Record<Locale, string>={
  en: "Fourth-year Network and Systems student at PTIT and Cloud DevOps Engineer (Intern) at HPT, building automated, traceable infrastructure on AWS and Azure.",
  vi: "Sinh viên năm tư PTIT, Cloud DevOps Engineer (thực tập) tại HPT, xây dựng hạ tầng tự động trên AWS và Azure."
};
// Q-23b: công việc tại HPT.
const hptSummary: Record<Locale, string>={
  en: "Deploying Microsoft Azure cloud services: API Management, Azure Functions, Microsoft Fabric and Power Automate.",
  vi: "Triển khai các dịch vụ cloud Microsoft Azure: API Management, Azure Functions, Microsoft Fabric và Power Automate."
};
export const content=validateContent({
  profiles: locales.map(locale => ({
    locale,
    name: locale==="vi"? "Nguyễn Hữu Bảo Duy":"Nguyen Huu Bao Duy",
    role: "Cloud & DevOps Engineer",
    level: "Intern",
    introduction: introduction[locale],
    email: "duybao09012004@gmail.com",
    // Số theo CV PDF Duy gửi; Duy chọn hiện cả trên web (L2-010, 2026-11-04).
    phone: "083 418 4916",
    cvUrl: "TBD",
    githubUrl: "https://github.com/Crozn1812",
    linkedinUrl: "https://www.linkedin.com/in/nguyenhuubaoduy",
    // Duy cho phép nêu tên HPT (2026-11-04). Không ghi thời lượng.
    experience: [
      {
        employer: "HPT",
        title: "Cloud & DevOps Intern",
        start: "2026-07",
        end: "present",
        summary: hptSummary[locale],
        evidence: []
      }
    ],
    // Theo CV của Duy; Q-23a xác nhận tên ngành.
    education: [
      {
        institution: "Posts and Telecommunications Institute of Technology (PTIT)",
        program: locale==="vi"? "Kỹ sư Mạng và Hệ thống":"Network and Systems Engineer",
        expectedGraduation: "2027",
        status: "in-progress"
      }
    ],
    ...review
  })),
  projects: locales.flatMap(locale => slugs.map(slug => ({
    id: slug,
    slug,
    locale,
    ...copy[slug]![locale],
    // Q-12: tất cả dự án đã hoàn thành (reviewStatus vẫn draft nên web vẫn hiện nhãn Draft).
    status: "completed",
    evidence: repos[slug]!.evidence,
    metrics: [],
    repoUrl: repos[slug]!.repoUrl,
    ...review,
    translationStatus: "TBD",
    contentVersion: "TBD"
  }))),
  evidence,
});
