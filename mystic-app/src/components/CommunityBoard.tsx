import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ImagePlus,
  Pencil,
  Trash2,
  Building2,
  List,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  X
} from "lucide-react";
import { auth } from "../firebase";
import {
  COMMUNITY_TOPICS,
  createCommunityPost,
  createCommunityReply,
  compressImage,
  deleteCommunityPost,
  deleteCommunityReply,
  editCommunityReply,
  discardCommunityImage,
  editCommunityPost,
  loadCommunityLocation,
  newRequestId,
  saveCommunityLocation,
  uploadCommunityImage,
  loadCommunityCities,
  loadCommunityPosts,
  loadCommunityReplies,
  loadCommunityStates,
  loadCommunitySettings,
  reportCommunityContent,
  type CommunityCity,
  type CommunityPost,
  type CommunityReply,
  type CommunityState,
  type CommunityTopic
} from "../lib/communityBoard";
import { APP_TEXT } from "../lib/appText";
import { REPORT_DETAILS_MAX, REPORT_REASONS, validateReportInput, type ReportReason } from "../lib/communityReports";
import ProfileLink from "./ProfileLink";

const TOPIC_BADGE_STYLES: Record<CommunityTopic, string> = {
  General: "border-slate-300/40 bg-slate-400/10 text-slate-200",
  Spirituality: "border-fuchsia-300/40 bg-fuchsia-500/10 text-fuchsia-200",
  Tarot: "border-violet-300/50 bg-violet-500/15 text-violet-200",
  Wellness: "border-sky-300/40 bg-sky-500/10 text-sky-200",
  Events: "border-amber-300/50 bg-amber-500/10 text-amber-200",
  Friendship: "border-indigo-300/50 bg-indigo-500/15 text-indigo-200",
  "Local Gems": "border-emerald-300/50 bg-emerald-500/10 text-emerald-200",
  Introductions: "border-pink-300/50 bg-pink-500/10 text-pink-200"
};

type Props = {
  onSignIn: () => void;
  onViewProfile: (uid: string) => void;
};

function AuthorAvatar({ author, size, onOpen }: { author: CommunityPost["author"]; size: "md" | "sm"; onOpen: (uid: string) => void }) {
  const name = author?.displayName || "Member";
  const dimensions = size === "md" ? "h-12 w-12 border-mystic-gold/70 text-sm" : "h-8 w-8 border-mystic-gold/40 text-[10px]";
  return (
    <ProfileLink uid={author?.uid} name={name} onOpen={onOpen} className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-[#271643] font-display text-mystic-gold transition hover:ring-2 hover:ring-mystic-gold/50 ${dimensions}`}>
      {author?.avatarUrl ? <img src={author.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </ProfileLink>
  );
}

function AuthorName({ author, className, onOpen }: { author: CommunityPost["author"]; className: string; onOpen: (uid: string) => void }) {
  const name = author?.displayName || "Member";
  return (
    <ProfileLink uid={author?.uid} name={name} onOpen={onOpen} className={`${className} hover:text-mystic-gold hover:underline`}>
      {name}
    </ProfileLink>
  );
}

function formattedDate(value: number | null) {
  return value === null ? "Just posted" : new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "M";
}

const MAX_COMMUNITY_IMAGES = 3;
type Attachment = { id: string; previewUrl: string };

function useImageAttachments(onError: (message: string) => void, target: "post" | "reply" = "post") {
  const [items, setItems] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>, room: number) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (files.length > room) {
      onError(`You can attach up to ${MAX_COMMUNITY_IMAGES} images.`);
      return;
    }
    setUploading(true);
    onError("");
    try {
      for (const file of files) {
        const compressed = await compressImage(file);
        const { imageId } = await uploadCommunityImage(compressed, target);
        setItems((current) => [...current, { id: imageId, previewUrl: URL.createObjectURL(compressed) }]);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not upload the image.");
    } finally {
      setUploading(false);
    }
  };
  const remove = (id: string) => {
    setItems((current) => {
      current.filter((item) => item.id === id).forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return current.filter((item) => item.id !== id);
    });
    void discardCommunityImage(id).catch(() => undefined);
  };
  // Forget the previews once their images are attached to published content.
  const clear = () => {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
  };
  // Cancelling also deletes the never-attached uploads from storage.
  const discardAll = () => {
    items.forEach((item) => void discardCommunityImage(item.id).catch(() => undefined));
    clear();
  };
  return { items, uploading, pick, remove, clear, discardAll };
}

function ImageField({ existing, onRemoveExisting, draft, compact, canAdd = true }: { canAdd?: boolean; existing: { id: string; url: string }[]; onRemoveExisting: (id: string) => void; draft: ReturnType<typeof useImageAttachments>; compact?: boolean }) {
  const room = MAX_COMMUNITY_IMAGES - existing.length - draft.items.length;
  const thumb = compact ? "h-16" : "h-24";
  return (
    <div className="w-full space-y-2">
      {(existing.length > 0 || draft.items.length > 0) && (
        <div className={compact ? "grid grid-cols-4 gap-2" : "grid grid-cols-3 gap-2"}>
          {existing.map((image) => (
            <div key={image.id} className="relative"><img src={image.url} alt="Attached" className={`${thumb} w-full rounded-lg object-cover`} /><button type="button" onClick={() => onRemoveExisting(image.id)} aria-label="Remove image" className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><X className="h-3.5 w-3.5" /></button></div>
          ))}
          {draft.items.map((item) => (
            <div key={item.id} className="relative"><img src={item.previewUrl} alt="Selected upload preview" className={`${thumb} w-full rounded-lg object-cover`} /><button type="button" onClick={() => draft.remove(item.id)} aria-label="Remove image" className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><X className="h-3.5 w-3.5" /></button></div>
          ))}
        </div>
      )}
      {canAdd && <label className={`flex ${compact ? "h-9 text-xs" : "h-11 text-sm"} cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-mystic-gold/40 text-mystic-gold ${room <= 0 || draft.uploading ? "pointer-events-none opacity-50" : "hover:bg-mystic-gold/10"}`}>
        {draft.uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {draft.uploading ? "Uploading…" : "Add photos from your device"}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void draft.pick(event, room)} className="sr-only" />
      </label>}
      {!compact && canAdd && <p className="text-[11px] text-slate-500">Up to {MAX_COMMUNITY_IMAGES} JPEG, PNG or WebP images, 2.5 MB each. They are resized before upload.</p>}
    </div>
  );
}

export default function CommunityBoard({ onSignIn, onViewProfile }: Props) {
  const [states, setStates] = useState<CommunityState[]>([]);
  const [cities, setCities] = useState<CommunityCity[]>([]);
  const [stateCode, setStateCode] = useState("");
  const [cityName, setCityName] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<CommunityTopic | "">("");
  const [viewerUid, setViewerUid] = useState<string | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [replies, setReplies] = useState<CommunityReply[]>([]);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [statesLoading, setStatesLoading] = useState(true);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [statesError, setStatesError] = useState("");
  const [citiesError, setCitiesError] = useState("");
  const [postsError, setPostsError] = useState("");
  const [repliesError, setRepliesError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newTopic, setNewTopic] = useState<CommunityTopic>("General");
  const [replyDraft, setReplyDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<{ id: string; name: string } | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [postsRefresh, setPostsRefresh] = useState(0);
  const [repliesRefresh, setRepliesRefresh] = useState(0);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason | "">("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportError, setReportError] = useState("");
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<{ postId: string; id: string; draft: string; images: { id: string; url: string }[]; removedImageIds: string[] } | null>(null);
  const postImages = useImageAttachments(setActionError);
  const replyImages = useImageAttachments(setActionError, "reply");
  const replyEditImages = useImageAttachments(setActionError, "reply");
  const [replyImagesEnabled, setReplyImagesEnabled] = useState(false);
  const [deleteReplyTarget, setDeleteReplyTarget] = useState<{ postId: string; id: string } | null>(null);
  const scrollToReplyRef = useRef<string | null>(null);
  const pendingCityRef = useRef("");
  const postRequestIdRef = useRef(newRequestId());
  const replyRequestIdRef = useRef(newRequestId());

  const selectedState = useMemo(() => states.find((state) => state.code === stateCode), [states, stateCode]);
  const selectedCity = useMemo(() => cities.find((city) => city === cityName), [cities, cityName]);

  useEffect(() => {
    void loadCommunitySettings().then((settings) => setReplyImagesEnabled(settings.replyImagesEnabled)).catch(() => setReplyImagesEnabled(false));
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => setViewerUid(user && !user.isAnonymous ? user.uid : null));
    void loadCommunityStates().then(({ states: availableStates }) => {
      if (active) setStates(availableStates);
    }).catch((error: unknown) => {
      if (active) setStatesError(error instanceof Error ? error.message : "Could not load states.");
    }).finally(() => {
      if (active) setStatesLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!viewerUid || states.length === 0) return;
    void loadCommunityLocation().then(({ stateCode: savedState, cityName: savedCity }) => {
      if (!active || !savedState || !states.some((state) => state.code === savedState)) return;
      pendingCityRef.current = savedCity;
      setStateCode((current) => current || savedState);
    }).catch((error: unknown) => console.error("Could not load saved Community location:", error));
    return () => {
      active = false;
    };
  }, [viewerUid, states]);

  useEffect(() => {
    let active = true;
    setCities([]);
    setCityName("");
    setCitiesError("");
    if (!stateCode) {
      setCitiesLoading(false);
      return;
    }
    setCitiesLoading(true);
    void loadCommunityCities(stateCode).then(({ cities: availableCities }) => {
      if (!active) return;
      setCities(availableCities);
      const savedCity = pendingCityRef.current;
      pendingCityRef.current = "";
      if (savedCity && availableCities.includes(savedCity)) setCityName(savedCity);
    }).catch((error: unknown) => {
      if (active) setCitiesError(error instanceof Error ? error.message : "Could not load cities.");
    }).finally(() => {
      if (active) setCitiesLoading(false);
    });
    return () => {
      active = false;
    };
  }, [stateCode]);

  useEffect(() => {
    setReplies([]);
    setReplyTarget(null);
    setEditingReply(null);
    setDeleteReplyTarget(null);
  }, [expandedPostId]);

  useEffect(() => {
    if (!actionMessage && !actionError) return;
    const timer = window.setTimeout(() => { setActionMessage(""); setActionError(""); }, 5000);
    return () => window.clearTimeout(timer);
  }, [actionMessage, actionError]);

  useEffect(() => {
    const id = scrollToReplyRef.current;
    if (!id || !replies.some((reply) => reply.id === id)) return;
    scrollToReplyRef.current = null;
    document.getElementById(`reply-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [replies]);

  useEffect(() => {
    setPosts([]);
    setExpandedPostId(null);
  }, [viewerUid, stateCode, cityName, selectedTopic]);

  useEffect(() => {
    let active = true;
    if (!viewerUid || !stateCode || !cityName) {
      setPostsLoading(false);
      setPostsError("");
      return;
    }
    setPostsLoading(true);
    setPostsError("");
    void loadCommunityPosts(stateCode, cityName, selectedTopic).then(({ posts: loaded }) => {
      if (active) setPosts(loaded);
    }).catch((error: unknown) => {
      console.error("Could not load Community Board posts:", error);
      if (active) setPostsError(error instanceof Error ? error.message : "Posts could not be loaded. Please try again.");
    }).finally(() => {
      if (active) setPostsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [viewerUid, stateCode, cityName, selectedTopic, postsRefresh]);

  useEffect(() => {
    let active = true;
    setRepliesError("");
    if (!viewerUid || !expandedPostId) {
      setReplies([]);
      return;
    }
    void loadCommunityReplies(expandedPostId).then(({ replies: loaded }) => {
      if (active) setReplies(loaded);
    }).catch((error: unknown) => {
      console.error("Could not load Community Board replies:", error);
      if (active) setRepliesError(error instanceof Error ? error.message : "Replies could not be loaded.");
    });
    return () => {
      active = false;
    };
  }, [viewerUid, expandedPostId, repliesRefresh]);

  const handleStateChange = (code: string) => {
    pendingCityRef.current = "";
    setStateCode(code);
    if (viewerUid && code) void saveCommunityLocation(code, "").catch((error: unknown) => console.error("Could not save Community location:", error));
  };

  const handleCityChange = (city: string) => {
    setCityName(city);
    if (viewerUid && stateCode && city) void saveCommunityLocation(stateCode, city).catch((error: unknown) => console.error("Could not save Community location:", error));
  };

  const resetComposer = () => {
    postImages.clear();
    setRemovedImageIds([]);
    setEditingPost(null);
    setNewTitle("");
    setNewBody("");
    setNewTopic("General");
    setIsCreateOpen(false);
  };

  const closeComposer = () => {
    postImages.discardAll();
    resetComposer();
  };

  const beginEdit = (post: CommunityPost) => {
    setEditingPost(post);
    setNewTitle(post.title);
    setNewBody(post.body);
    setNewTopic(post.topic);
    setRemovedImageIds([]);
    setActionError("");
    setIsCreateOpen(true);
  };

  const confirmDelete = async (postId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setActionError("");
    try {
      await deleteCommunityPost(postId);
      setDeleteTargetId(null);
      setExpandedPostId(null);
      setPostsRefresh((value) => value + 1);
      setActionMessage("Your post was deleted.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete the post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || postImages.uploading) return;
    if (!editingPost && (!stateCode || !cityName)) return;
    setIsSubmitting(true);
    setActionError("");
    setActionMessage("");
    try {
      if (editingPost) {
        await editCommunityPost(editingPost.id, newTitle.trim(), newBody.trim(), removedImageIds, postImages.items.map((item) => item.id));
      } else {
        await createCommunityPost({
          stateCode,
          cityName,
          topic: newTopic,
          title: newTitle.trim(),
          body: newBody.trim(),
          imageIds: postImages.items.map((item) => item.id),
          requestId: postRequestIdRef.current
        });
        postRequestIdRef.current = newRequestId();
      }
      const wasEditing = Boolean(editingPost);
      resetComposer();
      setPostsRefresh((value) => value + 1);
      setActionMessage(wasEditing ? "Your post was updated." : "Your post was published.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not publish your post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async (event: React.FormEvent<HTMLFormElement>, postId: string) => {
    event.preventDefault();
    if (!replyDraft.trim() || isSubmitting || replyImages.uploading) return;
    setIsSubmitting(true);
    setActionError("");
    try {
      const created = await createCommunityReply(postId, replyDraft.trim(), replyTarget?.id, replyRequestIdRef.current, replyImages.items.map((item) => item.id));
      scrollToReplyRef.current = created.replyId;
      replyRequestIdRef.current = newRequestId();
      setReplyDraft("");
      replyImages.clear();
      setReplyTarget(null);
      setRepliesRefresh((value) => value + 1);
      setPostsRefresh((value) => value + 1);
      setActionMessage("Your reply was published.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not publish your reply.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplyEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingReply || !editingReply.draft.trim() || isSubmitting || replyEditImages.uploading) return;
    setIsSubmitting(true);
    setActionError("");
    try {
      await editCommunityReply(editingReply.postId, editingReply.id, editingReply.draft.trim(), editingReply.removedImageIds, replyEditImages.items.map((item) => item.id));
      replyEditImages.clear();
      setEditingReply(null);
      setRepliesRefresh((value) => value + 1);
      setActionMessage("Your reply was updated.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update your reply.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmReplyDelete = async () => {
    if (!deleteReplyTarget || isSubmitting) return;
    setIsSubmitting(true);
    setActionError("");
    try {
      await deleteCommunityReply(deleteReplyTarget.postId, deleteReplyTarget.id);
      setDeleteReplyTarget(null);
      setReplyTarget(null);
      setRepliesRefresh((value) => value + 1);
      setPostsRefresh((value) => value + 1);
      setActionMessage("Your reply was deleted.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete the reply.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openReport = (target: string) => {
    if (!viewerUid) {
      onSignIn();
      return;
    }
    setReportTarget(target);
    setReportReason("");
    setReportDetails("");
    setReportError("");
  };

  const handleReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportTarget) return;
    const [postId, replyId] = reportTarget.split(":");
    const checked = validateReportInput({ postId, ...(replyId ? { replyId } : {}), reason: reportReason, details: reportDetails });
    if (!checked.ok) {
      setReportError(checked.error);
      return;
    }
    setIsSubmitting(true);
    setReportError("");
    try {
      await reportCommunityContent(postId, checked.value.reason, checked.value.details, replyId || undefined);
      setReportTarget(null);
      setReportReason("");
      setReportDetails("");
      setActionMessage("Thank you. Your report was saved and sent to our moderators for review.");
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Could not submit your report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderReportForm = (targetLabel: "post" | "reply") => (
    <form onSubmit={(event) => void handleReport(event)} onClick={(event) => event.stopPropagation()} aria-label={`Report this ${targetLabel}`} className="rounded-xl border border-rose-300/25 bg-rose-950/20 p-3 text-left">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-rose-100">Report this {targetLabel}</span><button type="button" onClick={() => setReportTarget(null)} aria-label="Close report form" className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button></div>
      <fieldset disabled={isSubmitting} className="space-y-2">
        <legend className="sr-only">Reason</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {REPORT_REASONS.map((reason) => (
            <label key={reason.id} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${reportReason === reason.id ? "border-rose-200/60 bg-rose-900/30 text-white" : "border-white/10 bg-black/20 text-slate-300 hover:border-rose-200/30"}`}>
              <input type="radio" name={`report-reason-${targetLabel}`} value={reason.id} checked={reportReason === reason.id} onChange={() => { setReportReason(reason.id); setReportError(""); }} className="accent-rose-300" />
              {reason.label}
            </label>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">Details {reportReason === "other" ? "(required)" : "(optional)"}</span>
          <textarea value={reportDetails} onChange={(event) => { setReportDetails(event.target.value); setReportError(""); }} maxLength={REPORT_DETAILS_MAX} rows={2} placeholder="Anything that will help our moderators understand the problem." className="w-full rounded-lg border border-rose-200/20 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-200/50" />
          <span className="block text-right text-[10px] text-slate-500">{reportDetails.length}/{REPORT_DETAILS_MAX}</span>
        </label>
        {reportError && <p role="alert" className="text-xs text-rose-200">{reportError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!reportReason} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-700/80 px-3 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50">{isSubmitting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{isSubmitting ? "Submitting…" : "Submit report"}</button>
          <button type="button" onClick={() => setReportTarget(null)} className="min-h-9 rounded-lg border border-white/15 px-3 text-xs text-slate-200">Cancel</button>
        </div>
        <p className="text-[10px] text-slate-500">Reports are private. Moderators review them before taking any action.</p>
      </fieldset>
    </form>
  );

  const openCreatePost = () => {
    if (!viewerUid) {
      onSignIn();
      return;
    }
    if (!stateCode || !cityName) {
      setActionError("Choose a state and city before creating a post.");
      return;
    }
    setActionError("");
    setIsCreateOpen(true);
  };

  const repliesByParent = useMemo(() => {
    const ids = new Set(replies.map((reply) => reply.id));
    const groups = new Map<string, CommunityReply[]>();
    replies.forEach((reply) => {
      const key = reply.parentReplyId && ids.has(reply.parentReplyId) ? reply.parentReplyId : "";
      groups.set(key, [...(groups.get(key) ?? []), reply]);
    });
    return groups;
  }, [replies]);

  const renderReply = (reply: CommunityReply, postId: string): React.ReactNode => {
    const children = repliesByParent.get(reply.id) ?? [];
    const name = reply.author?.displayName || "Member";
    return (
      <div key={reply.id} id={`reply-${reply.id}`} className="relative border-l border-mystic-gold/30 pl-3">
        <span className="absolute -left-px top-4 h-px w-2 bg-mystic-gold/40" aria-hidden="true" />
        <div className="flex gap-2.5">
          <AuthorAvatar author={reply.author} size="sm" onOpen={onViewProfile} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]"><AuthorName author={reply.author} className="font-bold text-slate-200" onOpen={onViewProfile} /><time className="text-slate-500">{formattedDate(reply.createdAt)}</time>{reply.editedAt && <span className="text-slate-500">(edited)</span>}</div>
            {editingReply?.id === reply.id ? (
              <form onSubmit={(event) => void handleReplyEdit(event)} className="mt-1 space-y-2">
                <textarea value={editingReply.draft} onChange={(event) => setEditingReply({ ...editingReply, draft: event.target.value })} maxLength={2000} rows={3} aria-label="Edit reply" className="w-full resize-y rounded-lg border border-[#39235f] bg-[#090613] px-3 py-2 text-sm text-white outline-none focus:border-mystic-gold" />
                {(replyImagesEnabled || editingReply.images.length > 0) && <ImageField compact canAdd={replyImagesEnabled} draft={replyEditImages} existing={editingReply.images.filter((image) => !editingReply.removedImageIds.includes(image.id))} onRemoveExisting={(id) => setEditingReply({ ...editingReply, removedImageIds: [...editingReply.removedImageIds, id] })} />}
                <div className="flex gap-2"><button type="submit" disabled={isSubmitting || replyEditImages.uploading || !editingReply.draft.trim()} className="rounded-lg bg-mystic-gold px-3 py-1.5 text-xs font-semibold text-[#0b081c] disabled:opacity-50">Save</button><button type="button" onClick={() => { replyEditImages.discardAll(); setEditingReply(null); }} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200">Cancel</button></div>
              </form>
            ) : <><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{reply.body}</p>{reply.images.length > 0 && <div className={`mt-2 grid gap-2 ${reply.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{reply.images.map((image) => <img key={image.id} src={image.url} alt="Attached to reply" loading="lazy" className="max-h-60 w-full rounded-lg border border-white/10 object-cover" />)}</div>}</>}
            {deleteReplyTarget?.id === reply.id && (
              <div role="alertdialog" aria-label="Confirm reply deletion" className="mt-2 rounded-lg border border-rose-300/30 bg-rose-950/25 p-2.5 text-xs text-rose-100">
                <p>Delete this reply{(repliesByParent.get(reply.id)?.length ?? 0) > 0 ? " and the replies beneath it" : ""}? This cannot be undone.</p>
                <div className="mt-2 flex gap-2"><button type="button" disabled={isSubmitting} onClick={() => void confirmReplyDelete()} className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">{isSubmitting ? "Deleting…" : "Delete"}</button><button type="button" onClick={() => setDeleteReplyTarget(null)} className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200">Cancel</button></div>
              </div>
            )}
            {viewerUid && <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] font-semibold"><button type="button" onClick={() => { setReplyTarget({ id: reply.id, name }); setReplyDraft(""); }} className="text-teal-200 hover:text-mystic-gold">Reply</button>{reply.authorUid === viewerUid && <><button type="button" onClick={() => { setDeleteReplyTarget(null); replyEditImages.discardAll(); setEditingReply({ postId, id: reply.id, draft: reply.body, images: reply.images, removedImageIds: [] }); }} className="inline-flex items-center gap-1 text-mystic-gold/90 hover:text-mystic-gold"><Pencil className="h-3 w-3" aria-hidden="true" />Edit</button><button type="button" onClick={() => { setEditingReply(null); setDeleteReplyTarget({ postId, id: reply.id }); }} className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200"><Trash2 className="h-3 w-3" aria-hidden="true" />Delete</button></>}</div>}
          </div>
          {reply.authorUid !== viewerUid && <button type="button" onClick={() => openReport(`${postId}:${reply.id}`)} aria-label="Report reply" title="Report reply" className="h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-rose-950/30 hover:text-rose-200"><AlertTriangle className="mx-auto h-3.5 w-3.5" aria-hidden="true" /></button>}
        </div>
        {reportTarget === `${postId}:${reply.id}` && <div className="mt-2">{renderReportForm("reply")}</div>}
        {children.length > 0 && <div className="mt-2 space-y-3 pl-2 sm:pl-4">{children.map((child) => renderReply(child, postId))}</div>}
      </div>
    );
  };

  return (
    <section className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-7xl space-y-5 pb-8 text-slate-100 sm:px-2 lg:px-4">
      <header className="relative isolate flex min-h-[26rem] flex-col justify-between overflow-hidden rounded-3xl border border-mystic-gold/50 bg-[#09051a] shadow-[0_0_36px_rgba(123,75,206,0.25)] sm:min-h-[30rem]">
        {/* Artwork is anchored to its bottom edge: the top of IMG_3442.png contains baked-in "State/City" pills, so only its clean lower scene is shown. */}
        <img src="/IMG_3442.png" alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 -z-20 h-[250%] w-full object-cover object-bottom" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#09051a]/85 via-[#09051a]/20 to-[#09051a]/90" />

        <div className="px-4 pt-4 text-center sm:px-8 sm:pt-5">
          <p className="inline-flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.3em] text-mystic-gold drop-shadow-md"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{APP_TEXT.appName}</p>
          <h1 className="mt-0.5 font-display text-2xl italic tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,.9)] sm:text-3xl">{APP_TEXT.community.pageTitle}</h1>
          {(statesError || citiesError) && <p role="alert" className="mx-auto mt-2 max-w-md rounded-lg bg-black/60 px-3 py-1.5 text-xs text-rose-200">{statesError || citiesError}</p>}
          <div className="mx-auto mt-4 grid max-w-3xl gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="sr-only">{APP_TEXT.community.stateLabel}</span>
              <span className="relative flex h-12 items-center rounded-full border-2 border-mystic-gold/80 bg-[#1a0b3a]/85 shadow-[0_0_18px_rgba(243,198,95,.25)] backdrop-blur-sm focus-within:border-mystic-gold focus-within:ring-2 focus-within:ring-mystic-gold/30">
                <MapPin className="pointer-events-none absolute left-3 h-5 w-5 text-mystic-gold" aria-hidden="true" />
                <select value={stateCode} onChange={(event) => handleStateChange(event.target.value)} disabled={statesLoading || Boolean(statesError)} className="h-full w-full cursor-pointer appearance-none rounded-full bg-transparent pl-11 pr-10 font-display text-base text-white outline-none disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="" className="bg-[#150d29]">{statesLoading ? "Loading states…" : statesError ? "State list unavailable" : APP_TEXT.community.statePlaceholder}</option>
                  {states.map((state) => <option key={state.code} value={state.code} className="bg-[#150d29]">{state.name}</option>)}
                </select>
                {statesLoading ? <LoaderCircle className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-mystic-gold" /> : <ChevronDown className="pointer-events-none absolute right-3 h-5 w-5 text-mystic-gold" />}
              </span>
            </label>
            <label className="block">
              <span className="sr-only">{APP_TEXT.community.cityLabel}</span>
              <span className="relative flex h-12 items-center rounded-full border-2 border-mystic-gold/80 bg-[#1a0b3a]/85 shadow-[0_0_18px_rgba(243,198,95,.25)] backdrop-blur-sm focus-within:border-mystic-gold focus-within:ring-2 focus-within:ring-mystic-gold/30">
                <Building2 className="pointer-events-none absolute left-3 h-5 w-5 text-mystic-gold" aria-hidden="true" />
                <select value={cityName} onChange={(event) => handleCityChange(event.target.value)} disabled={!stateCode || citiesLoading || Boolean(citiesError)} className="h-full w-full cursor-pointer appearance-none rounded-full bg-transparent pl-11 pr-10 font-display text-base text-white outline-none disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="" className="bg-[#150d29]">{!stateCode ? "Choose a state first" : citiesLoading ? "Loading cities…" : citiesError ? "City list unavailable" : APP_TEXT.community.cityPlaceholder}</option>
                  {cities.map((city) => <option key={city} value={city} className="bg-[#150d29]">{city}</option>)}
                </select>
                {citiesLoading ? <LoaderCircle className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-mystic-gold" /> : <ChevronDown className="pointer-events-none absolute right-3 h-5 w-5 text-mystic-gold" />}
              </span>
            </label>
          </div>
        </div>

        <div className="px-5 pb-5 text-center sm:px-8 sm:pb-6">
          <h2 className="font-display text-3xl text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.95)] sm:text-4xl">{selectedCity && selectedState ? `${selectedCity}, ${selectedState.name}` : APP_TEXT.community.defaultHeading}</h2>
          <div className="mx-auto mt-1 flex max-w-xs items-center justify-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-gradient-to-r from-transparent to-mystic-gold/70" /><span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-100">{APP_TEXT.community.boardLabel}</span><span className="h-px flex-1 bg-gradient-to-l from-transparent to-mystic-gold/70" /></div>
          <p className="mt-2 font-display text-sm italic tracking-wide text-slate-100 drop-shadow-[0_2px_8px_rgba(0,0,0,.9)] sm:text-base">{APP_TEXT.community.tagline}</p>
          <p className="mt-2 text-[10px] text-slate-300/80">Locations come from a live U.S. state/city data service and are chosen manually; location is never inferred.</p>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Filter posts by topic</span>
            <select value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value as CommunityTopic | "")} className="h-11 w-full appearance-none rounded-xl border border-mystic-gold/35 bg-[#150d29] pl-10 pr-10 text-sm text-white outline-none focus:border-mystic-gold">
              <option value="">{APP_TEXT.community.allTopics}</option>
              {COMMUNITY_TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </select>
            <List className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-mystic-gold" aria-hidden="true" />
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-mystic-gold" aria-hidden="true" />
          </label>
          <button type="button" onClick={openCreatePost} disabled={!stateCode || !cityName} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-mystic-gold/70 bg-gradient-to-r from-[#853ee5] via-[#6726bd] to-[#431581] px-5 text-sm font-semibold text-white shadow-[0_0_22px_rgba(135,62,229,.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-5 w-5 rounded-full bg-mystic-gold text-[#1a1032]" aria-hidden="true" />{APP_TEXT.community.createPost}
          </button>
        </div>

        {!viewerUid && stateCode && cityName && <button type="button" onClick={onSignIn} className="w-full rounded-xl border border-teal-300/25 bg-teal-950/20 p-3 text-sm text-teal-100 hover:border-teal-300/50">Sign in to view posts, reply, or create a post.</button>}
        {actionMessage && <p role="status" className="fixed bottom-24 left-1/2 z-[130] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-teal-300/40 bg-[#06201f]/95 px-4 py-3 text-center text-sm text-teal-100 shadow-xl">{actionMessage}</p>}
        {actionError && !isCreateOpen && <p role="alert" className="fixed bottom-24 left-1/2 z-[130] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-rose-300/40 bg-[#2a0a14]/95 px-4 py-3 text-center text-sm text-rose-100 shadow-xl">{actionError}</p>}

        {!stateCode || !cityName ? (
          <div className="rounded-2xl border border-white/10 bg-[#100a20]/90 px-5 py-10 text-center sm:py-14">
            <CircleHelp className="mx-auto h-8 w-8 text-mystic-gold/80" aria-hidden="true" />
            <h3 className="mt-3 font-display text-xl text-white">Choose your state and city</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">Select a location above to see real conversations posted by members in that community.</p>
          </div>
        ) : !viewerUid ? (
          <div className="rounded-2xl border border-white/10 bg-[#100a20]/90 px-5 py-10 text-center">
            <h3 className="font-display text-xl text-white">Member sign-in required</h3>
            <p className="mt-2 text-sm text-slate-400">Sign in to load the community feed. Board content is available only to authenticated members.</p>
          </div>
        ) : postsLoading && posts.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#100a20]/90 py-12 text-sm text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin text-mystic-gold" />Loading community posts…</div>
        ) : postsError && posts.length === 0 ? (
          <p role="alert" className="rounded-xl border border-rose-300/30 bg-rose-950/25 px-4 py-5 text-center text-sm text-rose-200">{postsError}</p>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-mystic-gold/20 bg-[radial-gradient(ellipse_at_top,rgba(106,64,165,.2),transparent_60%),#100a20] px-5 py-10 text-center sm:py-14">
            <MessageCircle className="mx-auto h-9 w-9 text-mystic-gold/80" aria-hidden="true" />
            <h3 className="mt-3 font-display text-xl text-white">Be the first to start a conversation</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">There are no posts in this city yet{selectedTopic ? ` for ${selectedTopic}` : ""}. Share a question, a local recommendation, or an invitation with your community.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => {
              const isExpanded = expandedPostId === post.id;
              return (
                <article key={post.id} className="overflow-hidden rounded-2xl border border-[#6642a0]/60 bg-gradient-to-br from-[#17102e] via-[#0f0a20] to-[#130d28] shadow-[0_6px_24px_rgba(0,0,0,.2)] transition hover:border-mystic-gold/45">
                  <div role="button" tabIndex={0} onClick={() => { setExpandedPostId(isExpanded ? null : post.id); setActionError(""); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setExpandedPostId(isExpanded ? null : post.id); setActionError(""); } }} aria-expanded={isExpanded} className="flex w-full cursor-pointer items-start gap-3 p-4 text-left sm:gap-4 sm:p-5">
                    <AuthorAvatar author={post.author} size="md" onOpen={onViewProfile} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 font-display text-lg leading-snug text-white sm:text-xl">{post.title}</h3>
                        <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] ${TOPIC_BADGE_STYLES[post.topic] ?? TOPIC_BADGE_STYLES.General}`}>{post.topic}</span>
                        {post.authorUid === viewerUid && (
                          <span className="flex shrink-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                            <button type="button" onClick={() => beginEdit(post)} aria-label={`Edit post ${post.title}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-mystic-gold/30 px-2 text-[10px] text-mystic-gold transition hover:bg-mystic-gold/10"><Pencil className="h-3 w-3" aria-hidden="true" />Edit</button>
                            <button type="button" onClick={() => setDeleteTargetId(post.id)} aria-label={`Delete post ${post.title}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-300/30 px-2 text-[10px] text-rose-200 transition hover:bg-rose-950/30"><Trash2 className="h-3 w-3" aria-hidden="true" />Delete</button>
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300 ${isExpanded ? "" : "line-clamp-2"}`}>{post.body}</p>
                      {post.images.length > 0 && (
                        <div className={`mt-3 grid gap-2 ${post.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {(isExpanded ? post.images : post.images.slice(0, 2)).map((image) => <img key={image.id} src={image.url} alt={`Attached to ${post.title}`} loading="lazy" className="max-h-72 w-full rounded-xl border border-white/10 object-cover" />)}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <AuthorName author={post.author} className="font-medium text-slate-200" onOpen={onViewProfile} />
                        <span aria-hidden="true">·</span><time>{formattedDate(post.createdAt)}</time>{post.editedAt && <span className="text-slate-500">(edited)</span>}
                        <span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />{post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}</span>
                      </div>
                    </div>
                    {isExpanded ? <ArrowDown className="mt-1 h-5 w-5 shrink-0 rotate-180 text-mystic-gold" aria-hidden="true" /> : <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-mystic-gold" aria-hidden="true" />}
                  </div>
                  {deleteTargetId === post.id && (
                        <div role="alertdialog" aria-label="Confirm post deletion" className="mx-4 mb-4 rounded-xl border border-rose-300/30 bg-rose-950/25 p-3 sm:mx-5 text-sm text-rose-100">
                          <p>Delete this post, its replies and its images? This cannot be undone.</p>
                          <div className="mt-2 flex gap-2">
                            <button type="button" disabled={isSubmitting} onClick={() => void confirmDelete(post.id)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{isSubmitting ? "Deleting…" : "Delete permanently"}</button>
                            <button type="button" onClick={() => setDeleteTargetId(null)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200">Cancel</button>
                          </div>
                        </div>
                      )}
                  {isExpanded && (
                    <div className="space-y-4 border-t border-white/10 bg-black/15 px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-display text-base text-teal-100">Replies</h4>
                        {post.authorUid !== viewerUid && <button type="button" onClick={() => openReport(`${post.id}:`)} aria-expanded={reportTarget === `${post.id}:`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[10px] text-slate-400 transition hover:border-rose-300/40 hover:text-rose-200"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Report post</button>}
                      </div>
                      {reportTarget === `${post.id}:` && renderReportForm("post")}
                      {repliesError && <p role="alert" className="text-xs text-rose-200">{repliesError}</p>}
                      {replies.length === 0 && !repliesError && <p className="text-xs text-slate-500">No replies yet. Be the first to respond.</p>}
                      <div className="space-y-3">
                        {(repliesByParent.get("") ?? []).map((reply) => renderReply(reply, post.id))}
                      </div>
                      {viewerUid ? (
                        <form onSubmit={(event) => void handleReply(event, post.id)} className="flex flex-wrap items-end gap-2">
                          {replyTarget && <p className="flex w-full items-center justify-between gap-2 rounded-lg border border-mystic-gold/25 bg-mystic-gold/5 px-3 py-1.5 text-xs text-slate-200"><span className="min-w-0 truncate">Replying to <strong className="text-mystic-gold">{replyTarget.name}</strong></span><button type="button" onClick={() => setReplyTarget(null)} aria-label="Cancel reply target" className="text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button></p>}
                          <label className="min-w-0 flex-1"><span className="sr-only">Write a reply</span><textarea value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} maxLength={2000} rows={2} placeholder={replyTarget ? `Reply to ${replyTarget.name}…` : "Write a thoughtful reply…"} className="w-full resize-y rounded-xl border border-[#39235f] bg-[#090613] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-mystic-gold" /></label>
                          <button type="submit" disabled={!replyDraft.trim() || isSubmitting || replyImages.uploading} aria-label="Send reply" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mystic-gold text-[#0b081c] disabled:opacity-50"><Send className="h-4 w-4" aria-hidden="true" /></button>
                          {replyImagesEnabled && <ImageField compact draft={replyImages} existing={[]} onRemoveExisting={() => undefined} />}
                        </form>
                      ) : <button type="button" onClick={onSignIn} className="text-xs text-teal-200 underline">Sign in to reply</button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isCreateOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="community-create-heading" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-mystic-gold/45 bg-gradient-to-b from-[#1b1034] to-[#090613] p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-6">
            <header className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-200">Your voice in {selectedCity}</p><h2 id="community-create-heading" className="mt-1 font-display text-2xl text-white">{editingPost ? "Edit Post" : "Create a Post"}</h2></div><button type="button" onClick={closeComposer} aria-label="Close post form" className="rounded-full border border-white/10 p-2 text-slate-300 hover:text-white"><X className="h-4 w-4" /></button></header>
            <form onSubmit={(event) => void handleCreatePost(event)} className="space-y-4">
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Topic</span><select value={newTopic} disabled={Boolean(editingPost)} onChange={(event) => setNewTopic(event.target.value as CommunityTopic)} className="h-11 w-full rounded-lg border border-[#39235f] bg-[#090613] px-3 text-sm text-white outline-none focus:border-mystic-gold">{COMMUNITY_TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Title</span><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required maxLength={120} placeholder="What would you like to ask or share?" className="h-11 w-full rounded-lg border border-[#39235f] bg-[#090613] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-mystic-gold" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Post</span><textarea value={newBody} onChange={(event) => setNewBody(event.target.value)} required maxLength={3000} rows={6} placeholder="Start a conversation with your community…" className="w-full resize-y rounded-lg border border-[#39235f] bg-[#090613] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-mystic-gold" /></label>
              <ImageField
                draft={postImages}
                existing={editingPost ? editingPost.images.filter((image) => !removedImageIds.includes(image.id)) : []}
                onRemoveExisting={(id) => setRemovedImageIds((current) => [...current, id])}
              />
              {actionError && <p role="alert" className="text-sm text-rose-200">{actionError}</p>}
              <button type="submit" disabled={isSubmitting || postImages.uploading || !newTitle.trim() || !newBody.trim()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#853ee5] to-[#521b9b] text-sm font-semibold text-white disabled:opacity-50">{isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editingPost ? "Save Changes" : "Publish Post"}</button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
