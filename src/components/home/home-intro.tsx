"use client";

import Image from "next/image";
import Link from "next/link";

const steps = [
  {
    id: 1,
    title: "选择算法",
    description: "根据巡检的场景和目标，选择合适的算法添加巡检任务",
    image: "/home-intro/step-1.png",
    alt: "选择算法示意图"
  },
  {
    id: 2,
    title: "任务配置",
    description: "配置巡检任务和执行规则，包括需要巡检的监控设备、巡检时间、异常复检规则、巡检结果通知方式等",
    image: "/home-intro/step-2.png",
    alt: "任务配置示意图"
  },
  {
    id: 3,
    title: "自动巡检",
    description: "到达指定的巡检时间，系统将使用AI算法自动巡检监控设备的画面",
    image: "/home-intro/step-3.png",
    alt: "自动巡检示意图"
  },
  {
    id: 4,
    title: "查看结果",
    description: "巡检完成后，系统将为您推送巡检结果数据以及巡检不合格设备的相关消息",
    image: "/home-intro/step-4.png",
    alt: "查看结果示意图"
  }
];

export function HomeIntro() {
  return (
    <section className="ai-home-page">
      <div className="ai-home-hero">
        <div className="ai-home-hero-title-wrap">
          <h1 className="ai-home-hero-title">AI算法巡检</h1>
        </div>

        <p className="ai-home-hero-copy">
          基于TP-LINK算法商城提供的云端AI图像检测算法，对摄像机监控画面进行定时自动巡检，帮助用户
          <br />
          及时发现监控场景存在的异常，高效赋能重复性的巡检工作，降低人力投入，提升巡检效率
        </p>

        <div className="ai-home-hero-actions">
          <Link href="/tasks/select" className="ai-home-hero-button">
            去使用
          </Link>
          <p className="ai-home-hero-note">初始赠送50000次算法分析次数，可免费体验</p>
        </div>
      </div>

      <div className="ai-home-step-grid">
        {steps.map((step) => (
          <article key={step.id} className="ai-home-step-card">
            <div className="ai-home-step-head">
              <div className="ai-home-step-index">{step.id}</div>
              <h2 className="ai-home-step-title">{step.title}</h2>
            </div>
            <p className="ai-home-step-copy">{step.description}</p>
            <div className="ai-home-step-visual">
              <Image
                src={`${step.image}?v=2`}
                alt={step.alt}
                fill
                unoptimized
                sizes="(max-width: 1600px) 33vw, 410px"
                className="ai-home-step-image"
                priority={step.id <= 2}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
