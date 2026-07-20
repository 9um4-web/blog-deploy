const { exec } = require("child_process");

/** 로그에서 시크릿 값을 [REDACTED]로 치환. deploy.sh가 나중에 verbose 명령을 추가해도 기본 방어선이 되도록. */
function redact(text, secrets = []) {
  return secrets.filter(Boolean).reduce((acc, s) => acc.split(s).join("[REDACTED]"), text);
}

/** deploy.sh를 실행하고 stdout/stderr를 합쳐(마스킹 처리 후) 반환한다. */
function runDeploy({ scriptPath, secretsToRedact = [] }) {
  return new Promise((resolve) => {
    exec(scriptPath, (err, stdout, stderr) => {
      const rawLog = [stdout, stderr, err?.message].filter(Boolean).join("\n");
      resolve({ ok: !err, log: redact(rawLog, secretsToRedact) });
    });
  });
}

module.exports = { runDeploy, redact };
