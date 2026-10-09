import {
  Route,
  Routes,
} from "react-router";
import CreatorProfilePage from "./pages/CreatorProfilePage";
import HomePage from "./pages/HomePage";
import TextEditorPage from "./pages/TextEditorPage";
import ImageEditorPage from "./pages/ImageEditorPage";
import SignUpPage from "./pages/SignUpPage";
import LoginPage from "./pages/LoginPage";
import MyWorksPage from "./pages/MyWorksPage";
import NeighborhoodPage from "./pages/NeighborhoodPage";
import PublishedWorkPage from "./pages/PublishedWorkPage";
import SavedWorksPage from "./pages/SavedWorksPage";
import LikedWorksPage from "./pages/LikedWorksPage";
import ProfilePage from "./pages/ProfilePage";
import FollowingPage from "./pages/FollowingPage";
import MyProjectsPage from "./pages/MyProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import PublishedProjectPage from "./pages/PublishedProjectPage";

function App() {
  return (
    <Routes>
      <Route path="/creator/:creatorId" element={<CreatorProfilePage />} />
      <Route path="/" element={<HomePage />} />

      <Route path="/text" element={<TextEditorPage />} />
      <Route path="/text/:workId" element={<TextEditorPage />} />

      <Route path="/image" element={<ImageEditorPage />} />
      <Route path="/image/:workId" element={<ImageEditorPage />} />

      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route path="/works" element={<MyWorksPage />} />
      <Route path="/projects" element={<MyProjectsPage />} />
    <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
    <Route path="/project/:projectId" element={<PublishedProjectPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/saved" element={<SavedWorksPage />} />
      <Route path="/liked" element={<LikedWorksPage />} />
      <Route path="/following" element={<FollowingPage />} />

      <Route
        path="/neighborhood"
        element={<NeighborhoodPage />}
      />

      <Route
        path="/work/:workId"
        element={<PublishedWorkPage />}
      />
    </Routes>
  );
}

export default App;
